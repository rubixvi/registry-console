import 'server-only'

import { env } from '@/lib/config/env'
import { database } from '@/lib/database/client'
import { brandingInput } from '@/lib/validation/branding'
import { type Branding } from '@/types/branding'

type SettingsRow = {
  value: string
}

export function getSettings(): Branding {
  const row = database().prepare("SELECT value FROM settings WHERE id = 'branding'").get() as
    | SettingsRow
    | undefined

  if (row) {
    const stored = JSON.parse(row.value)

    if (
      stored &&
      typeof stored === 'object' &&
      !brandingInput.shape.logoPath.safeParse(stored.logoPath).success
    ) {
      stored.logoPath = ''
    }
    return brandingInput.parse(stored)
  }

  return {
    name: env().BRAND_NAME,
    footer: '© 2026 Rubix Studios.',
    accent: '#6366f1',
    logoPath: '',
  }
}

export function saveSettings(value: Branding): void {
  database()
    .prepare(`
      INSERT INTO settings (id, value)
      VALUES ('branding', ?)
      ON CONFLICT (id) DO UPDATE SET value = excluded.value
    `)
    .run(JSON.stringify(value))
}

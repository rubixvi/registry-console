import 'server-only'

import { env } from '@/lib/config/env'
import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
import { transaction } from '@/lib/database/transaction'
import { brandingInput } from '@/lib/validation/branding'
import { type Branding } from '@/types/branding'

type Update = {
  settings: Branding
  username: string
  logo?: Buffer
  remove?: boolean
}

type SettingsRow = {
  value: string
}

export function getSettings(): Branding {
  const brandName = env().BRAND_NAME

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
    name: brandName,
    footer: `© ${new Date().getFullYear()} ${brandName}.`,
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

export function updateSettings({ settings, username, logo, remove = false }: Update): void {
  const db = database()

  transaction(() => {
    if (logo) {
      db.prepare(`
        INSERT INTO settings (id, value)
        VALUES ('brand-logo', ?)
        ON CONFLICT (id) DO UPDATE SET value = excluded.value
      `).run(logo.toString('base64'))
    } else if (remove) {
      db.prepare("DELETE FROM settings WHERE id = 'brand-logo'").run()
    }

    saveSettings(settings)
    audit(username, 'settings.update', '')
  })
}

export function removeLogo(username: string): void {
  const db = database()

  transaction(() => {
    const settings = getSettings()

    db.prepare("DELETE FROM settings WHERE id = 'brand-logo'").run()

    saveSettings({
      ...settings,
      logoPath: '',
    })

    audit(username, 'settings.logo.remove', '')
  })
}

import 'server-only'

import { createHash } from 'node:crypto'
import { type Metadata } from 'next'

import { getSettings } from '@/lib/settings'
import { getLogo } from '@/lib/settings/logo'

export function brandMetadata(): Metadata {
  const branding = getSettings()
  const logo = getLogo()

  const icon = logo
    ? `/api/branding/logo.png?v=${createHash('sha256').update(logo).digest('hex').slice(0, 12)}`
    : undefined

  return {
    title: {
      default: branding.name,
      template: `%s - ${branding.name}`,
    },
    icons: icon
      ? {
          icon: { url: icon, type: 'image/png' },
          shortcut: icon,
          apple: icon,
        }
      : undefined,
    robots: {
      index: false,
      follow: false,
    },
  }
}

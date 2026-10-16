import 'server-only'

import { type Metadata } from 'next'

import { getSettings } from '@/lib/settings'

export function brandMetadata(): Metadata {
  const branding = getSettings()

  return {
    title: {
      default: branding.name,
      template: `%s - ${branding.name}`,
    },
    robots: {
      index: false,
      follow: false,
    },
  }
}

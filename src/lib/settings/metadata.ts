import 'server-only'

import { type Metadata } from 'next'

import { getSettings } from '@/lib/settings'

export function brandMetadata(): Metadata {
  return {
    title: getSettings().name,
    robots: {
      index: false,
      follow: false,
    },
  }
}

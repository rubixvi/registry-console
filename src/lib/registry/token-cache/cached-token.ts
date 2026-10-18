import 'server-only'

import { tokens } from '@/lib/registry/token-cache/state'

export function cachedToken(key: string): string | null {
  const entry = tokens.get(key)

  if (!entry) return null

  if (entry.expires <= Date.now()) {
    tokens.delete(key)
    return null
  }

  return entry.value
}

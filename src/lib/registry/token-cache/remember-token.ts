import 'server-only'

import {
  EXPIRY_BUFFER_SECONDS,
  MAX_LIFETIME_SECONDS,
  MAX_TOKENS,
} from '@/lib/registry/token-cache/constants'
import { tokens } from '@/lib/registry/token-cache/state'

export function rememberToken(key: string, value: string, lifetime: number): void {
  const seconds = Math.min(lifetime, MAX_LIFETIME_SECONDS) - EXPIRY_BUFFER_SECONDS

  if (!Number.isFinite(seconds) || seconds <= 0) return

  tokens.delete(key)

  if (tokens.size >= MAX_TOKENS) {
    const oldestKey = tokens.keys().next().value

    if (oldestKey !== undefined) {
      tokens.delete(oldestKey)
    }
  }

  tokens.set(key, {
    value,
    expires: Date.now() + seconds * 1000,
  })
}

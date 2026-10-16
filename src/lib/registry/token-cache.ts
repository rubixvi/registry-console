import 'server-only'

import { registryCacheIdentity } from '@/lib/registry/identity'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord, type TokenCache } from '@/types/registry'

const MAX_TOKENS = 200
const MAX_LIFETIME_SECONDS = 300
const EXPIRY_BUFFER_SECONDS = 15

const tokens = new Map<string, TokenCache>()

export function tokenKey(registry: RegistryRecord, scope = ''): string {
  return keyedFingerprint('registry-token', [registryCacheIdentity(registry), scope])
}

export function cachedToken(key: string): string | null {
  const entry = tokens.get(key)

  if (!entry) return null

  if (entry.expires <= Date.now()) {
    tokens.delete(key)
    return null
  }

  return entry.value
}

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

export function forgetToken(key: string): void {
  tokens.delete(key)
}

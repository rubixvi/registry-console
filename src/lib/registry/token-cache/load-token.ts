import 'server-only'

import { cachedToken } from '@/lib/registry/token-cache/cached-token'
import { pending } from '@/lib/registry/token-cache/state'
import { hasLimits } from '@/lib/security/context'

export async function loadToken(key: string, load: () => Promise<string>): Promise<string> {
  const cached = cachedToken(key)

  if (cached) return cached

  const requestKey = `${key}:${hasLimits()}`
  let request = pending.get(requestKey)

  if (!request) {
    request = load()
    pending.set(requestKey, request)
  }

  try {
    return await request
  } finally {
    if (pending.get(requestKey) === request) pending.delete(requestKey)
  }
}

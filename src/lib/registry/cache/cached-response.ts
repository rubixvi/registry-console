import 'server-only'

import { forget } from '@/lib/registry/cache/forget'
import { cacheKey } from '@/lib/registry/cache/key'
import { entries } from '@/lib/registry/cache/state'
import { type RegistryRecord, type RegistryResponse } from '@/types/registry'

export function cachedResponse(
  registry: RegistryRecord,
  path: string,
  scope?: string
): RegistryResponse | null {
  const id = cacheKey(registry, path, scope)
  const entry = entries.get(id)

  if (!entry) return null

  if (entry.expires <= Date.now()) {
    forget(id)

    return null
  }

  entries.delete(id)
  entries.set(id, entry)

  return { text: entry.text, headers: new Headers(entry.headers) }
}

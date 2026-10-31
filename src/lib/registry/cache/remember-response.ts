import 'server-only'

import { cacheLifetime } from '@/lib/registry/cache/cache-lifetime'
import { MAX_BYTES, MAX_ENTRIES } from '@/lib/registry/cache/constants'
import { forget } from '@/lib/registry/cache/forget'
import { cacheKey } from '@/lib/registry/cache/key'
import { entries, state } from '@/lib/registry/cache/state'
import { type RegistryRecord, type RegistryResponse } from '@/types/registry'

export function rememberResponse(
  registry: RegistryRecord,
  path: string,
  scope: string | undefined,
  response: RegistryResponse,
  expectedGeneration: number
): void {
  if (state.generation !== expectedGeneration) return

  let lifetime = cacheLifetime(path)
  const control = response.headers.get('cache-control') ?? ''

  if (!lifetime || /(?:^|,)\s*(?:no-store|no-cache)(?:[=,\s]|$)/i.test(control)) return
  if (
    response.headers
      .get('vary')
      ?.split(',')
      .some((value) => value.trim() === '*')
  ) {
    return
  }

  const maxAge = control.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i)

  if (maxAge) {
    const age = Number(response.headers.get('age') ?? 0)

    lifetime = Math.min(
      lifetime,
      Math.max(0, Number(maxAge[1]) - (Number.isFinite(age) ? age : 0)) * 1000
    )
  }

  if (lifetime <= 0) return

  const headers: [string, string][] = []

  for (const name of ['content-type', 'docker-content-digest', 'link']) {
    const value = response.headers.get(name)

    if (value) headers.push([name, value])
  }

  const size = Buffer.byteLength(response.text) + Buffer.byteLength(JSON.stringify(headers))

  if (size > MAX_BYTES) return

  for (const [id, entry] of entries) {
    if (entry.expires <= Date.now()) forget(id)
  }

  const id = cacheKey(registry, path, scope)

  forget(id)

  while (entries.size >= MAX_ENTRIES || state.bytes + size > MAX_BYTES) {
    const oldest = entries.keys().next().value

    if (oldest === undefined) break

    forget(oldest)
  }

  entries.set(id, {
    registryId: registry.id,
    text: response.text,
    headers,
    expires: Date.now() + lifetime,
    bytes: size,
  })
  state.bytes += size
}

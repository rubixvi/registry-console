import 'server-only'

import { createHash } from 'node:crypto'

import { type CacheState, type Entry } from '@/types/cache'
import { type RegistryRecord, type RegistryResponse } from '@/types/registry'

const MAX_ENTRIES = 200
const MAX_BYTES = 32 * 1024 * 1024
const MUTABLE_LIFETIME = 15_000
const DIGEST_LIFETIME = 5 * 60_000

const globals = globalThis as typeof globalThis & {
  registryConsoleResponses?: CacheState
}

const state = globals.registryConsoleResponses ?? {
  entries: new Map<string, Entry>(),
  bytes: 0,
  generation: 0,
}

globals.registryConsoleResponses = state

const entries = state.entries

function key(registry: RegistryRecord, path: string, scope = ''): string {
  return createHash('sha256')
    .update(
      JSON.stringify([registry.id, registry.url, registry.username, registry.password, scope, path])
    )
    .digest('hex')
}

function forget(id: string): void {
  const entry = entries.get(id)

  if (!entry) return

  state.bytes -= entry.bytes
  entries.delete(id)
}

export function cacheGeneration(): number {
  return state.generation
}

export function cacheLifetime(path: string): number {
  const pathname = path.split('?')[0]

  if (/\/(?:manifests|blobs)\/sha256(?:%3A|:)[a-f0-9]{64}$/i.test(pathname)) {
    return DIGEST_LIFETIME
  }

  if (pathname === '/v2/_catalog' || /\/(?:tags\/list|manifests\/[^/]+)$/.test(pathname)) {
    return MUTABLE_LIFETIME
  }

  return 0
}

export function cachedResponse(
  registry: RegistryRecord,
  path: string,
  scope?: string
): RegistryResponse | null {
  const id = key(registry, path, scope)
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

  const id = key(registry, path, scope)

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

export function invalidateRegistry(registryId: string): void {
  state.generation++

  for (const [id, entry] of entries) {
    if (entry.registryId === registryId) forget(id)
  }
}

export function invalidateResponse(registry: RegistryRecord, path: string, scope?: string): void {
  state.generation++
  forget(key(registry, path, scope))
}

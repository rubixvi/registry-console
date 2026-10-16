import 'server-only'

import { randomUUID } from 'node:crypto'

import { type RegistryRecord } from '@/types/registry'

// Persisted connections have a revision. This bounded fallback also isolates
// transient records used by callers and fixtures without hashing credentials.
const transient = new Map<string, string>()

function credentialMarker(registry: RegistryRecord): string {
  const identity = JSON.stringify([
    registry.id,
    registry.url,
    registry.username,
    registry.password,
    registry.revision ?? '',
  ])

  let marker = transient.get(identity)

  if (!marker) {
    marker = randomUUID()

    if (transient.size >= 200) {
      const oldest = transient.keys().next().value

      if (oldest !== undefined) {
        transient.delete(oldest)
      }
    }

    transient.set(identity, marker)
  }

  return marker
}

export function registryIdentity(registry: RegistryRecord) {
  return {
    id: registry.id,
    url: registry.url,
    username: registry.username,
    provider: registry.provider ?? 'distribution',
    namespace: registry.namespace ?? '',
    readOnly: registry.readOnly,
    revision: registry.revision || credentialMarker(registry),
  }
}

export function registryCacheIdentity(registry: RegistryRecord) {
  // A process-local marker also isolates manually constructed records whose
  // credential values change without going through the persistent store.
  return { ...registryIdentity(registry), credentials: credentialMarker(registry) }
}

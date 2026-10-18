import 'server-only'

import { randomUUID } from 'node:crypto'

import { transient } from '@/lib/registry/identity/state'
import { type RegistryRecord } from '@/types/registry'

export function credentialMarker(registry: RegistryRecord): string {
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

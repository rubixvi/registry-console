import 'server-only'

import { credentialMarker } from '@/lib/registry/identity/credential-marker'
import { type RegistryRecord } from '@/types/registry'

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

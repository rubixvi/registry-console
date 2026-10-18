import 'server-only'

import { credentialMarker } from '@/lib/registry/identity/credential-marker'
import { registryIdentity } from '@/lib/registry/identity/registry-identity'
import { type RegistryRecord } from '@/types/registry'

export function registryCacheIdentity(registry: RegistryRecord) {
  return {
    ...registryIdentity(registry),
    credentials: credentialMarker(registry),
  }
}

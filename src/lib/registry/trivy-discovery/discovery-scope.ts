import 'server-only'

import { registryIdentity } from '@/lib/registry/identity'
import { fingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function discoveryScope(registry: RegistryRecord): string {
  return fingerprint('trivy-discovery', registryIdentity(registry))
}

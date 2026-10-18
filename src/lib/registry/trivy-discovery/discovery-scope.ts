import 'server-only'

import { registryIdentity } from '@/lib/registry/identity'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function discoveryScope(registry: RegistryRecord): string {
  return keyedFingerprint('trivy-discovery', registryIdentity(registry))
}

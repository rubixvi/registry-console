import 'server-only'

import { registryIdentity } from '@/lib/registry/identity'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function fingerprint(registry: RegistryRecord): string {
  return keyedFingerprint('deletion-plan', registryIdentity(registry))
}

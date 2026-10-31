import 'server-only'

import { registryIdentity } from '@/lib/registry/identity'
import { fingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function planKey(registry: RegistryRecord): string {
  return fingerprint('deletion-plan', registryIdentity(registry))
}

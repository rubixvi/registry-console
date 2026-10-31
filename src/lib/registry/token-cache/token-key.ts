import 'server-only'

import { registryCacheIdentity } from '@/lib/registry/identity'
import { fingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function tokenKey(registry: RegistryRecord, scope = ''): string {
  return fingerprint('registry-token', [registryCacheIdentity(registry), scope])
}

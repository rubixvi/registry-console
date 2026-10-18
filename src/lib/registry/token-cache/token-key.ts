import 'server-only'

import { registryCacheIdentity } from '@/lib/registry/identity'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function tokenKey(registry: RegistryRecord, scope = ''): string {
  return keyedFingerprint('registry-token', [registryCacheIdentity(registry), scope])
}

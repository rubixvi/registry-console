import 'server-only'

import { registryCacheIdentity } from '@/lib/registry/identity'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function key(registry: RegistryRecord, path: string, scope = ''): string {
  return keyedFingerprint('registry-response', [registryCacheIdentity(registry), scope, path])
}

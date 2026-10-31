import 'server-only'

import { registryCacheIdentity } from '@/lib/registry/identity'
import { fingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function cacheKey(registry: RegistryRecord, path: string, scope = ''): string {
  return fingerprint('registry-response', [registryCacheIdentity(registry), scope, path])
}

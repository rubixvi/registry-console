import 'server-only'

import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function pullScope(registry: RegistryRecord): string {
  return keyedFingerprint('dockerhub-quota', registry.username.toLowerCase() || 'anonymous')
}

import 'server-only'

import { fingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function pullScope(registry: RegistryRecord): string {
  return fingerprint('dockerhub-quota', registry.username.toLowerCase() || 'anonymous')
}

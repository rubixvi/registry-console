import 'server-only'

import { registryIdentity } from '@/lib/registry/identity'
import { fingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function scanKey(registry: RegistryRecord, digest: string): string {
  return fingerprint('trivy-image-report', [registryIdentity(registry), digest])
}

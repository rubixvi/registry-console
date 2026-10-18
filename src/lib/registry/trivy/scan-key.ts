import 'server-only'

import { registryIdentity } from '@/lib/registry/identity'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function scanKey(registry: RegistryRecord, digest: string): string {
  return keyedFingerprint('trivy-image-report', [registryIdentity(registry), digest])
}

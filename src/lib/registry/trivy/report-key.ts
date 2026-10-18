import 'server-only'

import { adoptScan, getScan } from '@/lib/database/scan'
import { registryIdentity } from '@/lib/registry/identity'
import { scanKey } from '@/lib/registry/trivy/scan-key'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export function reportKey(registry: RegistryRecord, repository: string, digest: string): string {
  const id = scanKey(registry, digest)

  if (!getScan(id)) {
    const previous = keyedFingerprint('trivy-report', [
      registryIdentity(registry),
      repository,
      digest,
    ])

    adoptScan(id, previous)
  }

  return id
}

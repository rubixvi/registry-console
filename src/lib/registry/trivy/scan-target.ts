import 'server-only'

import { reportKey } from '@/lib/registry/trivy/report-key'
import { type RegistryRecord } from '@/types/registry'
import { type ScanTarget } from '@/types/scan'

export function scanTarget(
  registry: RegistryRecord,
  repository: string,
  digest: string
): ScanTarget {
  return {
    id: reportKey(registry, repository, digest),
    registryId: registry.id,
    repository,
    digest,
  }
}

import 'server-only'

import { queueScan } from '@/lib/database/scan'
import { assertRepository } from '@/lib/registry/dockerhub'
import { scanAllowed } from '@/lib/registry/trivy/scan-allowed'
import { scanTarget } from '@/lib/registry/trivy/scan-target'
import { digestName, repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'

export function scheduleScan(
  registry: RegistryRecord,
  repository: string,
  digest: string
): boolean {
  if (!scanAllowed(registry)) return false

  repositoryName.parse(repository)
  digestName.parse(digest)
  assertRepository(registry, repository)

  return queueScan(scanTarget(registry, repository, digest))
}

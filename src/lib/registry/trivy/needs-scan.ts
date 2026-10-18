import 'server-only'

import { scanDue } from '@/lib/database/scan'
import { assertRepository } from '@/lib/registry/dockerhub'
import { reportKey } from '@/lib/registry/trivy/report-key'
import { scanAllowed } from '@/lib/registry/trivy/scan-allowed'
import { digestName, repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'

export function needsScan(registry: RegistryRecord, repository: string, digest: string): boolean {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertRepository(registry, repository)

  return scanAllowed(registry) && scanDue(reportKey(registry, repository, digest))
}

import 'server-only'

import path from 'node:path'

import { env } from '@/lib/config/env'
import { claimScan } from '@/lib/database/scan'
import { assertRepository } from '@/lib/registry/repository'
import { reportKey } from '@/lib/registry/trivy/report-key'
import { scanAllowed } from '@/lib/registry/trivy/scan-allowed'
import { AppError } from '@/lib/security/error'
import { digestName, repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'
import { type ScanJob } from '@/types/scan'

export function prepareScan(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  actor: string,
  override = false
): ScanJob {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertRepository(registry, repository)

  if (!scanAllowed(registry)) {
    throw new AppError(409, 'Trivy scanning is disabled. Set TRIVY_ENABLED=true to enable it.')
  }

  if (!path.isAbsolute(env().TRIVY_PATH)) {
    throw new AppError(
      503,
      'TRIVY_PATH must point to an installed executable using an absolute path.'
    )
  }

  const id = reportKey(registry, repository, digest)
  const expires = Date.now() + (env().TRIVY_TIMEOUT_SECONDS + 60) * 1000

  const lease = claimScan({
    id,
    registryId: registry.id,
    repository,
    digest,
    actor,
    expires,
    override,
  })

  return { id, registryId: registry.id, repository, digest, actor, ...lease }
}

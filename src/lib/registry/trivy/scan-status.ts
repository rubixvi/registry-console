import 'server-only'

import { getScan, scanDelay } from '@/lib/database/scan'
import { assertRepository } from '@/lib/registry/dockerhub'
import { reportKey } from '@/lib/registry/trivy/report-key'
import { scanAllowed } from '@/lib/registry/trivy/scan-allowed'
import { digestName, repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'
import { type ScanStatus } from '@/types/scan'

export function scanStatus(
  registry: RegistryRecord,
  repository: string,
  digest: string
): ScanStatus {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertRepository(registry, repository)

  if (!scanAllowed(registry)) {
    return { enabled: false, status: 'not-scanned' }
  }

  const row = getScan(reportKey(registry, repository, digest))

  if (!row) {
    return { enabled: true, status: 'not-scanned', retryAfter: scanDelay() }
  }

  if (row.status === 'running' && row.expires <= Date.now()) {
    return {
      enabled: true,
      status: 'failed',
      error: 'The scan was interrupted or timed out. Start a new scan.',
      retryAfter: scanDelay(),
    }
  }

  return {
    enabled: true,
    status: row.status,
    ...JSON.parse(row.value),
    ...(row.status === 'failed' ? { retryAfter: scanDelay() } : {}),
  }
}

import 'server-only'

import { activeScan, getScan, pendingScan, scanDelay } from '@/lib/database/scan'
import { assertRepository } from '@/lib/registry/repository'
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

  const id = reportKey(registry, repository, digest)
  const row = getScan(id)
  const pending = pendingScan(id)
  const active = activeScan()
  const queued = Boolean(
    pending &&
      row?.status !== 'complete' &&
      !(row?.status === 'running' && row.expires > Date.now())
  )
  const busy =
    active && active.id !== id && row?.status !== 'complete'
      ? {
          actor: 'system:trivy',
          repository: '',
          digest: '',
          ...JSON.parse(active.value),
          expires: active.expires,
        }
      : undefined
  const waiting = { queued, ...(busy ? { busy } : {}) }

  if (!row) {
    return {
      enabled: true,
      status: queued ? 'queued' : 'not-scanned',
      retryAfter: scanDelay(),
      ...waiting,
    }
  }

  if (row.status === 'running' && row.expires <= Date.now()) {
    return {
      enabled: true,
      status: queued ? 'queued' : 'failed',
      error: queued
        ? 'The previous scan was interrupted or timed out. A retry is queued.'
        : 'The scan was interrupted or timed out. Start a new scan.',
      retryAfter: scanDelay(),
      ...waiting,
    }
  }

  return {
    enabled: true,
    status: queued ? 'queued' : row.status,
    ...(row.status === 'complete' || row.status === 'failed' ? JSON.parse(row.value) : {}),
    ...waiting,
    ...(row.status === 'failed' || queued ? { retryAfter: scanDelay() } : {}),
  }
}

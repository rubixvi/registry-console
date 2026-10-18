import 'server-only'

import { env } from '@/lib/config/env'
import { audit } from '@/lib/database/audit'
import { discardScan, finishScan, getScan } from '@/lib/database/scan'
import { imageDetails } from '@/lib/registry/image'
import { requirePublic } from '@/lib/registry/scan-policy'
import { getRegistry } from '@/lib/registry/store'
import { executeTrivy } from '@/lib/registry/trivy/execute-trivy'
import { scanAllowed } from '@/lib/registry/trivy/scan-allowed'
import { scanKey } from '@/lib/registry/trivy/scan-key'
import { appendReport, emptyReport } from '@/lib/registry/trivy-report'
import { AppError } from '@/lib/security/error'
import { type ScanJob } from '@/types/scan'

export async function runScan(job: ScanJob): Promise<void> {
  if (job.started === false) return

  const stored = getScan(job.id)

  if (stored?.status !== 'running' || stored.expires !== job.expires) return

  try {
    const registry = getRegistry(job.registryId)

    if (!scanAllowed(registry) || scanKey(registry, job.digest) !== job.id) {
      discardScan(job.id)
      throw new AppError(409, 'The connection changed. Start the scan again.')
    }

    await requirePublic(registry, job.repository)

    const details = await imageDetails(registry, job.repository, job.digest)
    const platforms = details.platformDetails

    if (!platforms.length || platforms.length > 8) {
      throw new AppError(413, 'Scanning supports images with one to eight runnable platforms.')
    }

    const report = emptyReport(job.digest)
    const deadline = Math.min(job.expires, Date.now() + env().TRIVY_TIMEOUT_SECONDS * 1000)

    for (const entry of platforms) {
      const remaining = deadline - Date.now()

      if (remaining <= 0) {
        throw new AppError(504, 'The multi-platform vulnerability scan timed out.')
      }

      const output = await executeTrivy(
        registry,
        job.repository,
        entry.digest,
        entry.platform,
        remaining
      )

      appendReport(report, output, entry.platform)
    }

    const current = getRegistry(job.registryId)

    if (!scanAllowed(current) || scanKey(current, job.digest) !== job.id) {
      discardScan(job.id)
      throw new AppError(409, 'The connection changed. Start the scan again.')
    }

    report.scannedAt = new Date().toISOString()
    report.vulnerabilities.sort((a, b) => {
      const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']

      return order.indexOf(a.severity) - order.indexOf(b.severity)
    })

    if (finishScan(job.id, job.expires, { report })) {
      audit(job.actor, 'image.scan.complete', `${job.registryId}/${job.repository}@${job.digest}`)
    }
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : 'The vulnerability report could not be validated.'

    if (finishScan(job.id, job.expires, { error: message })) {
      audit(job.actor, 'image.scan.failed', `${job.registryId}/${job.repository}@${job.digest}`)
    }
  }
}

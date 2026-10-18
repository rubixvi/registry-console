import 'server-only'

import { discardScan } from '@/lib/database/scan'
import { imageDetails } from '@/lib/registry/image'
import { requirePublic } from '@/lib/registry/scan-policy'
import { prepareScan } from '@/lib/registry/trivy/prepare-scan'
import { reportKey } from '@/lib/registry/trivy/report-key'
import { scanAllowed } from '@/lib/registry/trivy/scan-allowed'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'
import { type ScanJob } from '@/types/scan'

export async function startScan(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  actor: string,
  override = false
): Promise<ScanJob | null> {
  if (!scanAllowed(registry)) {
    throw new AppError(409, 'Trivy scanning is disabled. Set TRIVY_ENABLED=true to enable it.')
  }

  await requirePublic(registry, repository)

  const details = await imageDetails(registry, repository, digest)

  if (!details.platformDetails.length) {
    discardScan(reportKey(registry, repository, digest))
    return null
  }

  if (details.platformDetails.length > 8) {
    throw new AppError(413, 'Scanning supports images with one to eight runnable platforms.')
  }

  return prepareScan(registry, repository, digest, actor, override)
}

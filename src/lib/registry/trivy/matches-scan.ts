import 'server-only'

import { reportKey } from '@/lib/registry/trivy/report-key'
import { type RegistryRecord } from '@/types/registry'

export function matchesScan(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  id: string
): boolean {
  return reportKey(registry, repository, digest) === id
}

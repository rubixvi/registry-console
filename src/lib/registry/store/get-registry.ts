import 'server-only'

import { env } from '@/lib/config/env'
import { validateUrl } from '@/lib/registry/allowlist'
import { registryRow } from '@/lib/registry/store/registry-row'
import { type RegistryRecord } from '@/types/registry'

export function getRegistry(id: string): RegistryRecord {
  const row = registryRow(id)

  return {
    id: row.id,
    name: row.name,
    url: validateUrl(row.url, row.provider),
    pullUrl: row.pull_url,
    username: row.username,
    password: row.password,
    revision: row.revision,
    readOnly: Boolean(row.read_only),
    provider: row.provider,
    namespace: row.namespace,
    trivyEnabled: env().TRIVY_ENABLED === 'true',
  }
}

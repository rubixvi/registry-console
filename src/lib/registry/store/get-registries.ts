import 'server-only'

import { env } from '@/lib/config/env'
import { listRegistries } from '@/lib/database/registry'
import { type Registry } from '@/types/registry'

export function getRegistries(): Registry[] {
  return listRegistries().map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    pullUrl: row.pull_url,
    username: row.username,
    hasPassword: Boolean(row.password),
    readOnly: Boolean(row.read_only),
    provider: row.provider,
    namespace: row.namespace,
    trivyEnabled: env().TRIVY_ENABLED === 'true',
  }))
}

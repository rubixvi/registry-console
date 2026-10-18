import 'server-only'

import { env } from '@/lib/config/env'
import { validateUrl } from '@/lib/registry/allowlist'
import { type RegistryRecord } from '@/types/registry'

export function scanAllowed(registry: RegistryRecord): boolean {
  validateUrl(registry.url, registry.provider)

  return env().TRIVY_ENABLED === 'true'
}

import 'server-only'

import { DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { checkBackoff } from '@/lib/registry/throttle/check-backoff'
import { pullScope } from '@/lib/registry/throttle/pull-scope'
import { type RegistryRecord } from '@/types/registry'

export function checkRegistry(registry: RegistryRecord, path: string, method: string): void {
  const origin = new URL(registry.url).origin

  checkBackoff(origin)

  if (origin === DOCKER_HUB_REGISTRY && method === 'GET' && path.includes('/manifests/')) {
    checkBackoff(origin, pullScope(registry))
  }
}

import 'server-only'

import { validateUrl } from '@/lib/registry/allowlist'
import { DOCKER_HUB_API, DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'

export function namespaceFor(registry: RegistryRecord): string {
  if (
    registry.provider !== 'dockerhub' ||
    registry.url !== DOCKER_HUB_REGISTRY ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(registry.namespace ?? '')
  ) {
    throw new AppError(400, 'Invalid Docker Hub connection settings.')
  }

  validateUrl(registry.url, registry.provider)
  validateUrl(DOCKER_HUB_API, registry.provider)

  return registry.namespace!
}

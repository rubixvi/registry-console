import 'server-only'

import { namespaceFor } from '@/lib/registry/dockerhub/namespace'
import { GITHUB_REGISTRY } from '@/lib/registry/github/constants'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'

export function assertRepository(registry: RegistryRecord, repository: string): void {
  if (registry.provider === 'dockerhub' && !repository.startsWith(`${namespaceFor(registry)}/`)) {
    throw new AppError(400, 'Repository is outside this Docker Hub namespace.')
  }

  if (
    registry.provider === 'github' &&
    (registry.url !== GITHUB_REGISTRY ||
      !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(registry.namespace ?? '') ||
      !repository.startsWith(`${registry.namespace}/`))
  ) {
    throw new AppError(400, 'Repository is outside this GitHub namespace.')
  }
}

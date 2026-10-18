import 'server-only'

import { namespaceFor } from '@/lib/registry/dockerhub/namespace'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'

export function assertRepository(registry: RegistryRecord, repository: string): void {
  if (registry.provider === 'dockerhub' && !repository.startsWith(`${namespaceFor(registry)}/`)) {
    throw new AppError(400, 'Repository is outside this Docker Hub namespace.')
  }
}

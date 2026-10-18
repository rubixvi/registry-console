import 'server-only'

import { assertRepository } from '@/lib/registry/dockerhub/assert'
import { namespaceFor } from '@/lib/registry/dockerhub/namespace'
import { AppError } from '@/lib/security/error'
import { repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'

export function hubPath(registry: RegistryRecord, repository: string): string {
  repositoryName.parse(repository)
  assertRepository(registry, repository)

  const namespace = namespaceFor(registry)
  const name = repository.slice(namespace.length + 1)

  if (!name || name.includes('/')) {
    throw new AppError(400, 'Invalid Docker Hub repository.')
  }

  return `/v2/namespaces/${encodeURIComponent(namespace)}/repositories/${encodeURIComponent(name)}`
}

import 'server-only'

import { audit } from '@/lib/database/audit'
import { registryRequest } from '@/lib/registry/client'
import { writable } from '@/lib/registry/delete/writable'
import { deleteVersion } from '@/lib/registry/github'
import { assertRepository } from '@/lib/registry/repository'
import { digestName, repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'

export async function deleteManifest(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  actor: string
): Promise<void> {
  writable(registry)
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertRepository(registry, repository)

  const encoded = repository.split('/').map(encodeURIComponent).join('/')

  if (registry.provider === 'github') {
    await deleteVersion(registry, repository, digest)
  } else {
    await registryRequest(registry, `/v2/${encoded}/manifests/${encodeURIComponent(digest)}`, {
      method: 'DELETE',
      scope: `repository:${repository}:${registry.provider === 'dockerhub' ? 'pull,push,delete' : 'pull,delete'}`,
    })
  }

  audit(actor, 'manifest.delete', `${registry.id}/${repository}@${digest}`)
}

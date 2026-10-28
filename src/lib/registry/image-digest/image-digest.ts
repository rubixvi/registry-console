import 'server-only'

import { requireRepo } from '@/lib/registry/access'
import { registryRequest } from '@/lib/registry/client'
import { imageManifest } from '@/lib/registry/image'
import { assertRepository } from '@/lib/registry/repository'
import { AppError } from '@/lib/security/error'
import { digestName, referenceName, repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'

export async function imageDigest(
  registry: RegistryRecord,
  repository: string,
  reference: string
): Promise<string> {
  await requireRepo(registry, repository)

  repositoryName.parse(repository)
  referenceName.parse(reference)
  assertRepository(registry, repository)

  const encoded = repository.split('/').map(encodeURIComponent).join('/')

  try {
    const response = await registryRequest(
      registry,
      `/v2/${encoded}/manifests/${encodeURIComponent(reference)}`,
      {
        method: 'HEAD',
        scope: `repository:${repository}:pull`,
      }
    )
    const digest = digestName.safeParse(response.headers.get('docker-content-digest'))

    if (digest.success) {
      if (reference.startsWith('sha256:') && digest.data !== reference) {
        throw new AppError(502, 'Manifest does not match the requested digest.')
      }

      return digest.data
    }
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 405) throw error
  }

  return (await imageManifest(registry, repository, reference, true)).digest
}

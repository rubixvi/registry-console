import 'server-only'

import { createHash } from 'node:crypto'

import { requireRepository } from '@/lib/registry/access'
import { cachedResponse, cacheGeneration, rememberResponse } from '@/lib/registry/cache'
import { registryRequest } from '@/lib/registry/client'
import { assertRepository } from '@/lib/registry/repository'
import { AppError } from '@/lib/security/error'
import { manifestSchema } from '@/lib/validation/image'
import { referenceName, repositoryName } from '@/lib/validation/registry'
import { type ImageManifest, type ManifestResult } from '@/types/image'
import { type RegistryRecord } from '@/types/registry'

export async function imageManifest(
  registry: RegistryRecord,
  repository: string,
  reference: string,
  refresh = false
): Promise<ManifestResult> {
  await requireRepository(registry, repository)

  repositoryName.parse(repository)
  assertRepository(registry, repository)
  referenceName.parse(reference)

  const encoded = repository.split('/').map(encodeURIComponent).join('/')
  const scope = `repository:${repository}:pull`
  const path = `/v2/${encoded}/manifests/${encodeURIComponent(reference)}`
  const generation = cacheGeneration()
  const cached = !refresh && cachedResponse(registry, path, scope)

  const result =
    cached ||
    (await registryRequest(registry, path, {
      scope,
      cache: refresh ? 'reload' : 'default',
    }))

  let manifest: ImageManifest

  try {
    manifest = manifestSchema.parse(JSON.parse(result.text))
  } catch {
    throw new AppError(502, 'Unsupported or invalid manifest. Schema v2 or OCI is required.')
  }

  const hash = createHash('sha256').update(result.text).digest('hex')
  const digest = `sha256:${hash}`
  const advertised = result.headers.get('docker-content-digest')
  const requested = reference.startsWith('sha256:')

  if (advertised && advertised !== digest) {
    throw new AppError(502, 'Registry manifest digest verification failed.')
  }

  if (requested && reference !== digest) {
    throw new AppError(502, 'Manifest does not match the requested digest.')
  }

  if (!cached && !refresh && !requested) {
    rememberResponse(
      registry,
      `/v2/${encoded}/manifests/${encodeURIComponent(digest)}`,
      scope,
      result,
      generation
    )
  }

  return {
    manifest,
    digest,
    verified: Boolean(advertised || requested),
    mediaType: manifest.mediaType || result.headers.get('content-type') || 'unknown',
  }
}

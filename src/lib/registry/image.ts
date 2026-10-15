import 'server-only'

import { createHash } from 'node:crypto'

import { env } from '@/lib/config/env'
import { registryRequest } from '@/lib/registry/client'
import { AppError } from '@/lib/security/error'
import { manifestSchema } from '@/lib/validation/image'
import { referenceName, repositoryName } from '@/lib/validation/registry'
import { type ImageDetails, type ImageManifest } from '@/types/image'
import { type RegistryRecord } from '@/types/registry'
import { imageHistory } from '@/utils/image-history'
import { imageLabels } from '@/utils/image-labels'

export async function imageManifest(
  registry: RegistryRecord,
  repository: string,
  reference: string,
  refresh = false
): Promise<{ manifest: ImageManifest; digest: string; verified: boolean; mediaType: string }> {
  repositoryName.parse(repository)
  referenceName.parse(reference)

  const encoded = repository.split('/').map(encodeURIComponent).join('/')

  const scope = `repository:${repository}:pull`
  const result = await registryRequest(
    registry,
    `/v2/${encoded}/manifests/${encodeURIComponent(reference)}`,
    { scope, cache: refresh ? 'reload' : 'default' }
  )

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

  return {
    manifest,
    digest,
    verified: Boolean(advertised || requested),
    mediaType: manifest.mediaType || result.headers.get('content-type') || 'unknown',
  }
}

export async function imageDetails(
  registry: RegistryRecord,
  repository: string,
  reference: string,
  refresh = false
): Promise<ImageDetails> {
  const { manifest, digest, verified, mediaType } = await imageManifest(
    registry,
    repository,
    reference,
    refresh
  )
  const encoded = repository.split('/').map(encodeURIComponent).join('/')
  const scope = `repository:${repository}:pull`
  let config: unknown = null

  if (manifest.config) {
    const blob = await registryRequest(registry, `/v2/${encoded}/blobs/${manifest.config.digest}`, {
      scope,
      cache: refresh ? 'reload' : 'default',
    })

    const configHash = createHash('sha256').update(blob.text).digest('hex')
    const configDigest = `sha256:${configHash}`

    if (configDigest !== manifest.config.digest) {
      throw new AppError(502, 'Image configuration digest verification failed.')
    }

    try {
      config = JSON.parse(blob.text)
    } catch {
      throw new AppError(502, 'Registry returned invalid image configuration.')
    }
  }

  const layers = manifest.layers ?? []
  const manifests = manifest.manifests ?? []
  const configSize = manifest.config?.size ?? 0
  const size = layers.reduce((total, layer) => total + layer.size, configSize)
  const platforms: string[] = []

  for (const entry of manifests) {
    if (!entry.platform) continue

    const { os, architecture, variant } = entry.platform
    const parts = [os, architecture]

    if (variant) {
      parts.push(variant)
    }

    platforms.push(parts.join('/'))
  }

  return {
    verified,
    digest,
    mediaType,
    size,
    platforms,
    manifest,
    config,
    history: imageHistory(config, manifest.layers),
    labels: imageLabels(config, env().HISTORY_CUSTOM_LABELS),
  }
}

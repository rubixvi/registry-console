import 'server-only'

import { createHash } from 'node:crypto'

import { env } from '@/lib/config/env'
import { registryRequest } from '@/lib/registry/client'
import { assertDockerHubRepository } from '@/lib/registry/dockerhub'
import { AppError } from '@/lib/security/error'
import { manifestSchema } from '@/lib/validation/image'
import { referenceName, repositoryName } from '@/lib/validation/registry'
import {
  type ImageDetails,
  type ImageManifest,
  type ManifestResult,
  type PlatformDetails,
} from '@/types/image'
import { type RegistryRecord } from '@/types/registry'
import { imageHistory } from '@/utils/image-history'
import { imageLabels } from '@/utils/image-labels'
import { createdAnnotation, imageCreated, isAttestation, isRunnable } from '@/utils/image-metadata'

export async function imageManifest(
  registry: RegistryRecord,
  repository: string,
  reference: string,
  refresh = false
): Promise<ManifestResult> {
  repositoryName.parse(repository)
  assertDockerHubRepository(registry, repository)
  referenceName.parse(reference)

  const encoded = repository.split('/').map(encodeURIComponent).join('/')
  const scope = `repository:${repository}:pull`

  const result = await registryRequest(
    registry,
    `/v2/${encoded}/manifests/${encodeURIComponent(reference)}`,
    {
      scope,
      cache: refresh ? 'reload' : 'default',
    }
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

async function imageConfiguration(
  registry: RegistryRecord,
  repository: string,
  manifest: ImageManifest,
  refresh: boolean
): Promise<unknown> {
  if (!manifest.config) {
    return null
  }

  const encoded = repository.split('/').map(encodeURIComponent).join('/')

  const blob = await registryRequest(registry, `/v2/${encoded}/blobs/${manifest.config.digest}`, {
    scope: `repository:${repository}:pull`,
    cache: refresh ? 'reload' : 'default',
  })

  const digest = `sha256:${createHash('sha256').update(blob.text).digest('hex')}`

  if (digest !== manifest.config.digest) {
    throw new AppError(502, 'Image configuration digest verification failed.')
  }

  try {
    return JSON.parse(blob.text)
  } catch {
    throw new AppError(502, 'Registry returned invalid image configuration.')
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

  const blobs = new Map<string, number>()
  const visited = new Set<string>()
  const order = new Map<string, number>([[digest, 0]])
  const waiting: (() => void)[] = []

  let active = 0
  let inspectionFailure: { error: unknown } | undefined
  const platformDetails: PlatformDetails[] = []
  const deadline = Date.now() + 45_000

  let config: unknown = null

  async function limited<T>(operation: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const start = () => {
        active++
        resolve()
      }

      if (active < 2) {
        start()
      } else {
        waiting.push(start)
      }
    })

    try {
      if (inspectionFailure) {
        throw inspectionFailure.error
      }

      return await operation()
    } finally {
      active--
      waiting.shift()?.()
    }
  }

  async function inspect(
    current: ImageManifest,
    currentDigest: string,
    depth: number,
    fallbackPlatform = ''
  ): Promise<void> {
    if (visited.has(currentDigest)) {
      return
    }

    if (Date.now() >= deadline) {
      throw new AppError(504, 'Image metadata inspection timed out. Refresh to try again.')
    }

    if (depth > 4 || visited.size >= 32) {
      throw new AppError(413, 'Image index exceeds the supported metadata inspection limit.')
    }

    visited.add(currentDigest)

    if (current.manifests) {
      const children = current.manifests.filter(
        (child) => !child.artifactType && !isAttestation(child)
      )
      let cursor = 0

      for (const child of children) {
        if (!order.has(child.digest)) {
          order.set(child.digest, order.size)
        }
      }

      async function worker(): Promise<void> {
        while (cursor < children.length && !inspectionFailure) {
          const child = children[cursor++]

          if (visited.has(child.digest)) {
            continue
          }

          try {
            if (Date.now() >= deadline) {
              throw new AppError(504, 'Image metadata inspection timed out. Refresh to try again.')
            }

            if (depth >= 4 || visited.size >= 32) {
              throw new AppError(
                413,
                'Image index exceeds the supported metadata inspection limit.'
              )
            }

            const result = await limited(() =>
              imageManifest(registry, repository, child.digest, refresh)
            )
            const platform = child.platform
              ? [child.platform.os, child.platform.architecture, child.platform.variant]
                  .filter(Boolean)
                  .join('/')
              : fallbackPlatform

            await inspect(result.manifest, result.digest, depth + 1, platform)
          } catch (error) {
            inspectionFailure ??= { error }
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(2, children.length) }, worker))

      if (inspectionFailure) {
        throw inspectionFailure.error
      }

      return
    }

    const currentConfig = await limited(() =>
      imageConfiguration(registry, repository, current, refresh)
    )

    if (currentDigest === digest) {
      config = currentConfig
    }

    const object =
      typeof currentConfig === 'object' && currentConfig !== null
        ? (currentConfig as Record<string, unknown>)
        : null

    const runnable = isRunnable(current, currentConfig)

    if (!runnable && currentDigest !== digest) return

    const layers = current.layers ?? []
    const descriptors = current.config ? [current.config, ...layers] : layers

    for (const descriptor of descriptors) {
      const previous = blobs.get(descriptor.digest)

      if (previous !== undefined && previous !== descriptor.size) {
        throw new AppError(502, 'Image descriptors disagree on the size of a shared blob.')
      }

      blobs.set(descriptor.digest, descriptor.size)
    }

    const platform =
      fallbackPlatform ||
      (typeof object?.os === 'string' && typeof object.architecture === 'string'
        ? [object.os, object.architecture, object.variant]
            .filter((part) => typeof part === 'string')
            .join('/')
        : 'Not provided')

    const created = imageCreated(object?.created) ?? createdAnnotation(current.annotations)

    if (runnable) {
      platformDetails.push({
        digest: currentDigest,
        platform,
        created,
        size: descriptors.reduce((total, descriptor) => total + descriptor.size, 0),
      })
    }
  }

  await inspect(manifest, digest, 0)

  platformDetails.sort(
    (left, right) => (order.get(left.digest) ?? 0) - (order.get(right.digest) ?? 0)
  )

  const dates = platformDetails.flatMap((entry) => (entry.created ? [entry.created] : [])).sort()

  const created = dates.at(-1) ?? createdAnnotation(manifest.annotations)
  const platforms = [...new Set(platformDetails.map((entry) => entry.platform))]

  return {
    verified,
    digest,
    mediaType,
    size: [...blobs.values()].reduce((total, size) => total + size, 0),
    created,
    platforms,
    platformDetails,
    manifest,
    config,
    history: imageHistory(config, manifest.layers),
    labels: imageLabels(config, env().HISTORY_CUSTOM_LABELS),
  }
}

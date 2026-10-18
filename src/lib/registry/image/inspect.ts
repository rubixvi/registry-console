import 'server-only'

import { imageConfiguration } from '@/lib/registry/image/image-configuration'
import { limited } from '@/lib/registry/image/limited'
import { worker } from '@/lib/registry/image/worker'
import { AppError } from '@/lib/security/error'
import { type ImageManifest } from '@/types/image'
import { type ImageInspection, type ImageQueue } from '@/types/registry-work'
import { createdAnnotation, imageCreated, isAttestation, isRunnable } from '@/utils/image-metadata'

export async function inspect(
  state: ImageInspection,
  current: ImageManifest,
  currentDigest: string,
  depth: number,
  fallbackPlatform = ''
): Promise<void> {
  if (state.visited.has(currentDigest)) {
    return
  }

  if (Date.now() >= state.deadline) {
    throw new AppError(504, 'Image metadata inspection timed out. Refresh to try again.')
  }

  if (depth > 4 || state.visited.size >= 32) {
    throw new AppError(413, 'Image index exceeds the supported metadata inspection limit.')
  }

  state.visited.add(currentDigest)

  if (current.manifests) {
    const children = current.manifests.filter(
      (child) => !child.artifactType && !isAttestation(child)
    )
    const queue: ImageQueue = { children, cursor: 0, depth, fallbackPlatform }

    for (const child of children) {
      if (!state.order.has(child.digest)) {
        state.order.set(child.digest, state.order.size)
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(2, children.length) }, () => worker(state, queue, inspect))
    )

    if (state.failure) {
      throw state.failure.error
    }

    return
  }

  const currentConfig = await limited(state, () =>
    imageConfiguration(state.registry, state.repository, current, state.refresh)
  )

  if (currentDigest === state.digest) {
    state.config = currentConfig
  }

  const object =
    typeof currentConfig === 'object' && currentConfig !== null
      ? (currentConfig as Record<string, unknown>)
      : null

  const runnable = isRunnable(current, currentConfig)

  if (!runnable && currentDigest !== state.digest) return

  const layers = current.layers ?? []
  const descriptors = current.config ? [current.config, ...layers] : layers

  for (const descriptor of descriptors) {
    const previous = state.blobs.get(descriptor.digest)

    if (previous !== undefined && previous !== descriptor.size) {
      throw new AppError(502, 'Image descriptors disagree on the size of a shared blob.')
    }

    state.blobs.set(descriptor.digest, descriptor.size)
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
    state.platformDetails.push({
      digest: currentDigest,
      platform,
      created,
      size: descriptors.reduce((total, descriptor) => total + descriptor.size, 0),
    })
  }
}

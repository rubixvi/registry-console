import 'server-only'

import { env } from '@/lib/config/env'
import { imageManifest } from '@/lib/registry/image/image-manifest'
import { inspect } from '@/lib/registry/image/inspect'
import { type ImageDetails } from '@/types/image'
import { type RegistryRecord } from '@/types/registry'
import { type ImageInspection } from '@/types/registry-work'
import { imageHistory } from '@/utils/image-history'
import { imageLabels } from '@/utils/image-labels'
import { createdAnnotation } from '@/utils/image-metadata'

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

  const state: ImageInspection = {
    registry,
    repository,
    refresh,
    digest,
    blobs: new Map(),
    visited: new Set(),
    order: new Map([[digest, 0]]),
    waiting: [],
    active: 0,
    platformDetails: [],
    deadline: Date.now() + 45_000,
    config: null,
  }

  await inspect(state, manifest, digest, 0)

  const { blobs, order, platformDetails, config } = state

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

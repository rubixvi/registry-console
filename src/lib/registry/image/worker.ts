import 'server-only'

import { imageManifest } from '@/lib/registry/image/image-manifest'
import { limited } from '@/lib/registry/image/limited'
import { AppError } from '@/lib/security/error'
import { type ImageInspection, type ImageQueue, type ImageVisitor } from '@/types/registry-work'

export async function worker(
  state: ImageInspection,
  queue: ImageQueue,
  visit: ImageVisitor
): Promise<void> {
  while (queue.cursor < queue.children.length && !state.failure) {
    const child = queue.children[queue.cursor++]

    if (state.visited.has(child.digest)) {
      continue
    }

    try {
      if (Date.now() >= state.deadline) {
        throw new AppError(504, 'Image metadata inspection timed out. Refresh to try again.')
      }

      if (queue.depth >= 4 || state.visited.size >= 32) {
        throw new AppError(413, 'Image index exceeds the supported metadata inspection limit.')
      }

      const result = await limited(state, () =>
        imageManifest(state.registry, state.repository, child.digest, state.refresh)
      )
      const platform = child.platform
        ? [child.platform.os, child.platform.architecture, child.platform.variant]
            .filter(Boolean)
            .join('/')
        : queue.fallbackPlatform

      await visit(state, result.manifest, result.digest, queue.depth + 1, platform)
    } catch (error) {
      state.failure ??= { error }
    }
  }
}

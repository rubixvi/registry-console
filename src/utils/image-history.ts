import { imageHistorySchema } from '@/lib/validation/history'
import { type ImageHistoryEntry, type ImageManifest } from '@/types/image'

export function imageHistory(
  config: unknown,
  layers: ImageManifest['layers'] = []
): ImageHistoryEntry[] {
  const parsed = imageHistorySchema.safeParse(config)

  if (!parsed.success || !parsed.data.history) return []

  let layerIndex = 0

  return parsed.data.history
    .map((entry, index) => {
      const layer = entry.empty_layer ? undefined : layers[layerIndex++]

      return {
        step: index + 1,
        created: entry.created ?? null,
        command: entry.created_by || 'Not provided',
        author: entry.author ?? null,
        comment: entry.comment ?? null,
        emptyLayer: Boolean(entry.empty_layer),
        size: layer?.size ?? null,
        digest: layer?.digest ?? null,
      }
    })
    .reverse()
}

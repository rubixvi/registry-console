import {
  type ImageConfig,
  type ImageDetails,
  type ImageManifest,
  type ImageSummary,
} from '@/types/image'

export function imageSummary(details: ImageDetails): ImageSummary {
  const config = details.config as ImageConfig | null
  const manifest = details.manifest as ImageManifest

  const platform = typeof config?.os === 'string' && typeof config?.architecture === 'string'

  return {
    created: details.created ?? 'Not provided',

    platform: details.platforms.length
      ? details.platforms.join(', ')
      : platform
        ? `${config.os}/${config.architecture}`
        : 'Not provided',

    children: manifest.manifests ?? [],
  }
}

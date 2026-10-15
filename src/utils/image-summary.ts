import {
  type ImageConfig,
  type ImageDetails,
  type ImageManifest,
  type ImageSummary,
} from '@/types/image'

export function imageSummary(details: ImageDetails): ImageSummary {
  const config = details.config as ImageConfig | null
  const manifest = details.manifest as ImageManifest

  const hasPlatform = typeof config?.os === 'string' && typeof config?.architecture === 'string'

  return {
    created: typeof config?.created === 'string' ? config.created : 'Not provided',
    platform: hasPlatform ? `${config.os}/${config.architecture}` : 'Image index',
    children: manifest.manifests ?? [],
  }
}

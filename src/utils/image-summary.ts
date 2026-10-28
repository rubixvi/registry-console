import {
  type ImageConfig,
  type ImageDetails,
  type ImageManifest,
  type ImageSummary,
} from '@/types/image'

function platform(config: ImageConfig | null): string {
  if (typeof config?.os !== 'string' || typeof config.architecture !== 'string') {
    return 'Not provided'
  }

  return `${config.os}/${config.architecture}`
}

export function imageSummary(details: ImageDetails): ImageSummary {
  const config = details.config as ImageConfig | null
  const manifest = details.manifest as ImageManifest

  const value = details.platforms.length ? details.platforms.join(', ') : platform(config)

  return {
    created: details.created ?? 'Not provided',
    platform: value,
    children: manifest.manifests ?? [],
  }
}

import { type ImageManifest, type ManifestEntry } from '@/types/image'

export function isAttestation(entry: Omit<ManifestEntry, 'digest'>): boolean {
  const annotations = entry.annotations

  return (
    (typeof annotations === 'object' &&
      annotations !== null &&
      'vnd.docker.reference.type' in annotations &&
      annotations['vnd.docker.reference.type'] === 'attestation-manifest') ||
    (entry.platform?.os === 'unknown' && entry.platform.architecture === 'unknown') ||
    entry.artifactType === 'application/vnd.docker.attestation.manifest.v1+json'
  )
}

export function isRunnable(manifest: ImageManifest, config: unknown): boolean {
  if (manifest.artifactType || isAttestation(manifest)) return false

  const mediaType = manifest.config?.mediaType

  if (
    mediaType &&
    mediaType !== 'application/vnd.oci.image.config.v1+json' &&
    mediaType !== 'application/vnd.docker.container.image.v1+json'
  ) {
    return false
  }

  if (manifest.layers?.some((layer) => layer.mediaType?.startsWith('application/vnd.in-toto'))) {
    return false
  }

  return (
    typeof config === 'object' &&
    config !== null &&
    'os' in config &&
    typeof config.os === 'string' &&
    config.os.length > 0 &&
    config.os !== 'unknown' &&
    'architecture' in config &&
    typeof config.architecture === 'string' &&
    config.architecture.length > 0 &&
    config.architecture !== 'unknown'
  )
}

export function imageCreated(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    return null
  }

  return new Date(value).toISOString()
}

export function createdAnnotation(annotations: unknown): string | null {
  if (
    typeof annotations !== 'object' ||
    annotations === null ||
    !('org.opencontainers.image.created' in annotations)
  ) {
    return null
  }

  return imageCreated(annotations['org.opencontainers.image.created'])
}

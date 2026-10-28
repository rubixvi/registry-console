import { type ImageManifest, type ManifestEntry } from '@/types/image'

function validPlatform(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false
  if (!('os' in config) || !('architecture' in config)) return false

  return [config.os, config.architecture].every(
    (value) => typeof value === 'string' && value.length > 0 && value !== 'unknown'
  )
}

export function isAttestation(entry: Omit<ManifestEntry, 'digest'>): boolean {
  if (entry.platform?.os === 'unknown' && entry.platform.architecture === 'unknown') {
    return true
  }

  if (entry.artifactType === 'application/vnd.docker.attestation.manifest.v1+json') {
    return true
  }

  const annotations = entry.annotations

  return (
    typeof annotations === 'object' &&
    annotations !== null &&
    'vnd.docker.reference.type' in annotations &&
    annotations['vnd.docker.reference.type'] === 'attestation-manifest'
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

  return validPlatform(config)
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
    !annotations ||
    typeof annotations !== 'object' ||
    !('org.opencontainers.image.created' in annotations)
  ) {
    return null
  }

  return imageCreated(annotations['org.opencontainers.image.created'])
}

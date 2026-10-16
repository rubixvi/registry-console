import { type ManifestEntry } from '@/types/image'

export function isAttestation(entry: ManifestEntry): boolean {
  const annotations = entry.annotations

  return (
    (typeof annotations === 'object' &&
      annotations !== null &&
      'vnd.docker.reference.type' in annotations &&
      annotations['vnd.docker.reference.type'] === 'attestation-manifest') ||
    (entry.platform?.os === 'unknown' && entry.platform.architecture === 'unknown')
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

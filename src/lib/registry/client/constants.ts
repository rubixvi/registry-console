import 'server-only'

export const MAX_INFLIGHT = 12

export const REQUEST_TIMEOUT_MS = 12_000

export const MAX_TOKEN_BYTES = 32 * 1024

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

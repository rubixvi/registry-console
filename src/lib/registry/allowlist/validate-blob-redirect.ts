import 'server-only'

import { env } from '@/lib/config/env'
import { allowedOrigins } from '@/lib/registry/allowlist/allowed-origins'
import { DOCKER_HUB_BLOBS, DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { AppError } from '@/lib/security/error'

export function validateBlobRedirect(raw: string, registryOrigin?: string): URL {
  let url: URL

  try {
    url = new URL(raw)
  } catch {
    throw new AppError(502, 'Invalid registry blob redirect.')
  }

  const trusted = registryOrigin === DOCKER_HUB_REGISTRY && DOCKER_HUB_BLOBS.has(url.origin)

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (!trusted && !allowedOrigins(env().REGISTRY_BLOB_ORIGINS).includes(url.origin))
  ) {
    throw new AppError(502, 'Registry blob redirect origin is not in REGISTRY_BLOB_ORIGINS.')
  }

  return url
}

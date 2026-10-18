import 'server-only'

import { env } from '@/lib/config/env'
import { allowedOrigins } from '@/lib/registry/allowlist/allowed-origins'
import { DOCKER_HUB_BLOBS, DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { GITHUB_BLOBS, GITHUB_REGISTRY } from '@/lib/registry/github/constants'
import { AppError } from '@/lib/security/error'

export function validateBlobRedirect(raw: string, registryOrigin?: string): URL {
  let url: URL

  try {
    url = new URL(raw)
  } catch {
    throw new AppError(502, 'Invalid registry blob redirect.')
  }

  const trusted =
    (registryOrigin === DOCKER_HUB_REGISTRY && DOCKER_HUB_BLOBS.has(url.origin)) ||
    (registryOrigin === GITHUB_REGISTRY && url.origin === GITHUB_BLOBS)

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

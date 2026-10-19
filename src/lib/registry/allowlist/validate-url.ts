import 'server-only'

import { env } from '@/lib/config/env'
import { allowedOrigins } from '@/lib/registry/allowlist/allowed-origins'
import { ALLOWED_PROTOCOLS } from '@/lib/registry/allowlist/constants'
import { DOCKER_HUB_API, DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { GITHUB_REGISTRY } from '@/lib/registry/github/constants'
import { AppError } from '@/lib/security/error'
import { type RegistryProvider } from '@/types/registry'

export function validateUrl(raw: string, provider?: RegistryProvider): string {
  let url: URL

  try {
    url = new URL(raw)
  } catch {
    throw new AppError(400, 'Invalid registry URL.')
  }

  const credentials = Boolean(url.username || url.password)
  const parts = Boolean(url.search || url.hash || url.pathname !== '/')

  if (credentials || parts || !ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new AppError(400, 'Use an HTTP(S) registry origin without credentials or paths.')
  }

  const config = env()

  if (url.protocol === 'http:' && config.ALLOW_HTTP_REGISTRIES !== 'true') {
    throw new AppError(400, 'HTTP registries are disabled. Use HTTPS.')
  }

  const trusted =
    url.origin === DOCKER_HUB_REGISTRY ||
    (provider === 'github' && url.origin === GITHUB_REGISTRY) ||
    (provider === 'dockerhub' && url.origin === DOCKER_HUB_API)

  if (!trusted && !allowedOrigins(config.REGISTRY_ALLOWED_ORIGINS).includes(url.origin)) {
    throw new AppError(400, 'Registry origin is not in REGISTRY_ALLOWED_ORIGINS.')
  }

  return url.origin
}

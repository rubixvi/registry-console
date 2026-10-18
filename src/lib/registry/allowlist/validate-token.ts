import 'server-only'

import { env } from '@/lib/config/env'
import { allowedOrigins } from '@/lib/registry/allowlist/allowed-origins'
import { ALLOWED_PROTOCOLS } from '@/lib/registry/allowlist/constants'
import { DOCKER_HUB_AUTH, DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { AppError } from '@/lib/security/error'

export function validateToken(raw: string, registryOrigin: string): URL {
  let url: URL

  try {
    url = new URL(raw)
  } catch {
    throw new AppError(502, 'Invalid token endpoint.')
  }

  const config = env()
  const origins = [registryOrigin, ...allowedOrigins(config.REGISTRY_TOKEN_ORIGINS)]

  const credentials = Boolean(url.username || url.password)
  const protocol = ALLOWED_PROTOCOLS.has(url.protocol)
  const trusted =
    registryOrigin === DOCKER_HUB_REGISTRY &&
    url.origin === DOCKER_HUB_AUTH &&
    url.pathname === '/token'
  const origin = trusted || origins.includes(url.origin)
  const blocked = url.protocol === 'http:' && config.ALLOW_HTTP_REGISTRIES !== 'true'

  if (credentials || url.hash || !protocol || !origin || blocked) {
    throw new AppError(502, 'Registry token endpoint is not permitted.')
  }

  return url
}

import 'server-only'

import { env } from '@/lib/config/env'
import {
  DOCKER_HUB_API,
  DOCKER_HUB_AUTH,
  DOCKER_HUB_BLOBS,
  DOCKER_HUB_REGISTRY,
} from '@/lib/registry/dockerhub-settings'
import { AppError } from '@/lib/security/error'
import { type RegistryProvider } from '@/types/registry'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function allowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin)
}

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
    (provider === 'dockerhub' && url.origin === DOCKER_HUB_API)

  if (!trusted && !allowedOrigins(config.REGISTRY_ALLOWED_ORIGINS).includes(url.origin)) {
    throw new AppError(400, 'Registry origin is not in REGISTRY_ALLOWED_ORIGINS.')
  }

  return url.origin
}

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

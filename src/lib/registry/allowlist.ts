import 'server-only'

import { env } from '@/lib/config/env'
import { AppError } from '@/lib/security/error'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function allowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin)
}

export function validateUrl(raw: string): string {
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

  const origins = allowedOrigins(config.REGISTRY_ALLOWED_ORIGINS)

  if (!origins.includes(url.origin)) {
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
  const origin = origins.includes(url.origin)
  const blocked = url.protocol === 'http:' && config.ALLOW_HTTP_REGISTRIES !== 'true'

  if (credentials || url.hash || !protocol || !origin || blocked) {
    throw new AppError(502, 'Registry token endpoint is not permitted.')
  }

  return url
}

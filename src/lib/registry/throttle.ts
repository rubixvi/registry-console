import 'server-only'

import {
  DOCKER_HUB_API,
  DOCKER_HUB_AUTH,
  DOCKER_HUB_BLOBS,
  DOCKER_HUB_REGISTRY,
} from '@/lib/registry/dockerhub-settings'
import { hasLimits } from '@/lib/security/context'
import { AppError } from '@/lib/security/error'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { readBounded } from '@/lib/security/request'
import { type RegistryRecord } from '@/types/registry'

const MAX_BACKOFFS = 200
const MAX_DELAY = 24 * 60 * 60
const globals = globalThis as typeof globalThis & {
  registryConsoleBackoffs?: Map<string, number>
}
const backoffs = globals.registryConsoleBackoffs ?? new Map<string, number>()

globals.registryConsoleBackoffs = backoffs

function pullScope(registry: RegistryRecord): string {
  return keyedFingerprint('dockerhub-quota', registry.username.toLowerCase() || 'anonymous')
}

function message(origin: string, scope: string, paused = false): string {
  if (scope) {
    return paused
      ? 'Docker Hub pull quota reached. Manifest requests are paused locally.'
      : 'Docker Hub pull quota reached. Docker Hub returned HTTP 429.'
  }

  const service =
    origin === DOCKER_HUB_REGISTRY
      ? 'Docker Hub registry'
      : origin === DOCKER_HUB_API
        ? 'Docker Hub API'
        : origin === DOCKER_HUB_AUTH
          ? 'Docker Hub authentication'
          : DOCKER_HUB_BLOBS.has(origin)
            ? 'Docker Hub image storage'
            : 'Upstream registry'

  return paused
    ? `${service} requests are paused locally after an upstream rate limit.`
    : `${service} returned HTTP 429. Its rate limit rejected this request.`
}

export function checkRegistry(registry: RegistryRecord, path: string, method: string): void {
  const origin = new URL(registry.url).origin

  checkBackoff(origin)

  if (origin === DOCKER_HUB_REGISTRY && method === 'GET' && path.includes('/manifests/')) {
    checkBackoff(origin, pullScope(registry))
  }
}

export async function limitResponse(
  registry: RegistryRecord,
  path: string,
  method: string,
  response: Response
): Promise<AppError> {
  const origin = new URL(registry.url).origin
  let scope = ''

  if (origin === DOCKER_HUB_REGISTRY && method === 'GET' && path.includes('/manifests/')) {
    let body = ''

    try {
      body = await readBounded(response, 16 * 1024, 2000)
    } catch {
      body = ''
    }

    if (
      /^0(?:;|$)/.test(response.headers.get('ratelimit-remaining')?.trim() ?? '') ||
      /pull rate limit|increase-rate-limits/i.test(body)
    ) {
      scope = pullScope(registry)
    }
  } else {
    await response.body?.cancel()
  }

  return limitRegistry(origin, response.headers, scope)
}

export function checkBackoff(origin: string, scope = ''): void {
  if (!hasLimits()) return

  const key = scope ? `${origin}|${scope}` : origin
  const expires = backoffs.get(key)

  if (!expires) return

  const seconds = Math.ceil((expires - Date.now()) / 1000)

  if (seconds > 0) {
    throw new AppError(429, message(origin, scope, true), seconds)
  }

  backoffs.delete(key)
}

export function limitRegistry(origin: string, headers = new Headers(), scope = ''): AppError {
  const now = Date.now()
  const key = scope ? `${origin}|${scope}` : origin
  const retry = headers.get('retry-after')?.trim()
  let seconds = 60

  if (retry) {
    const delay = /^\d+$/.test(retry) ? Number(retry) : (Date.parse(retry) - now) / 1000

    if (Number.isFinite(delay)) seconds = Math.ceil(delay)
  } else if (
    origin === DOCKER_HUB_REGISTRY &&
    (scope || /^0(?:;|$)/.test(headers.get('ratelimit-remaining')?.trim() ?? ''))
  ) {
    const window = headers.get('ratelimit-limit')?.match(/(?:^|;)\s*w=(\d+)/)?.[1]

    seconds = window ? Number(window) : 6 * 60 * 60
  }

  seconds = Math.max(1, Math.min(MAX_DELAY, seconds))

  for (const [key, expires] of backoffs) {
    if (expires <= now) backoffs.delete(key)
  }

  if (!backoffs.has(key) && backoffs.size >= MAX_BACKOFFS) {
    const first = backoffs.keys().next().value

    if (first !== undefined) backoffs.delete(first)
  }

  const expires = Math.max(backoffs.get(key) ?? 0, now + seconds * 1000)

  backoffs.set(key, expires)

  return new AppError(
    429,
    message(origin, scope),
    hasLimits() ? Math.ceil((expires - now) / 1000) : seconds
  )
}

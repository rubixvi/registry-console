import 'server-only'

import { DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
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

function message(scope: string): string {
  return scope
    ? 'Docker Hub pull quota reached. Manifest downloads are temporarily paused.'
    : 'Registry rate limit reached. Requests are temporarily paused.'
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
  const key = scope ? `${origin}|${scope}` : origin
  const expires = backoffs.get(key)

  if (!expires) return

  const seconds = Math.ceil((expires - Date.now()) / 1000)

  if (seconds > 0) {
    throw new AppError(429, message(scope), seconds)
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

  return new AppError(429, message(scope), Math.ceil((expires - now) / 1000))
}

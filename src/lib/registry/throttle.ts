import 'server-only'

import { DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { AppError } from '@/lib/security/error'

const MAX_ORIGINS = 200
const MAX_DELAY = 24 * 60 * 60
const globals = globalThis as typeof globalThis & {
  registryConsoleBackoffs?: Map<string, number>
}
const backoffs = globals.registryConsoleBackoffs ?? new Map<string, number>()

globals.registryConsoleBackoffs = backoffs

export function checkBackoff(origin: string): void {
  const expires = backoffs.get(origin)

  if (!expires) return

  const seconds = Math.ceil((expires - Date.now()) / 1000)

  if (seconds > 0) {
    throw new AppError(
      429,
      'Registry rate limit reached. Requests are temporarily paused.',
      seconds
    )
  }

  backoffs.delete(origin)
}

export function limitRegistry(origin: string, headers = new Headers()): AppError {
  const now = Date.now()
  const retry = headers.get('retry-after')?.trim()
  let seconds = 60

  if (retry) {
    const delay = /^\d+$/.test(retry) ? Number(retry) : (Date.parse(retry) - now) / 1000

    if (Number.isFinite(delay)) seconds = Math.ceil(delay)
  } else if (
    origin === DOCKER_HUB_REGISTRY &&
    /^0(?:;|$)/.test(headers.get('ratelimit-remaining')?.trim() ?? '')
  ) {
    const window = headers.get('ratelimit-limit')?.match(/(?:^|;)\s*w=(\d+)/)?.[1]

    seconds = window ? Number(window) : 6 * 60 * 60
  }

  seconds = Math.max(1, Math.min(MAX_DELAY, seconds))

  for (const [key, expires] of backoffs) {
    if (expires <= now) backoffs.delete(key)
  }

  if (!backoffs.has(origin) && backoffs.size >= MAX_ORIGINS) {
    const first = backoffs.keys().next().value

    if (first !== undefined) backoffs.delete(first)
  }

  const expires = Math.max(backoffs.get(origin) ?? 0, now + seconds * 1000)

  backoffs.set(origin, expires)

  return new AppError(
    429,
    'Registry rate limit reached. Requests are temporarily paused.',
    Math.ceil((expires - now) / 1000)
  )
}

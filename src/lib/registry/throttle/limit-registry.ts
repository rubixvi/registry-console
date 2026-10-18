import 'server-only'

import { DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { MAX_BACKOFFS, MAX_DELAY } from '@/lib/registry/throttle/constants'
import { message } from '@/lib/registry/throttle/message'
import { backoffs } from '@/lib/registry/throttle/state'
import { hasLimits } from '@/lib/security/context'
import { AppError } from '@/lib/security/error'

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

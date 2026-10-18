import 'server-only'

import { message } from '@/lib/registry/throttle/message'
import { backoffs } from '@/lib/registry/throttle/state'
import { hasLimits } from '@/lib/security/context'
import { AppError } from '@/lib/security/error'

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

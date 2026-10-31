import 'server-only'

import { createHash } from 'node:crypto'

import { consumeLimit } from '@/lib/database/limits'
import { AppError } from '@/lib/security/error'

export function rateLimit(key: string, maximum: number, windowMs: number): void {
  const now = Date.now()

  const expires = now + windowMs

  const id = createHash('sha256').update(key).digest('hex')
  const row = consumeLimit(id, now, expires)

  if (row.count > maximum) {
    throw new AppError(
      429,
      'Too many requests. Please try again later.',
      Math.max(1, Math.ceil((row.expires - now) / 1000))
    )
  }
}

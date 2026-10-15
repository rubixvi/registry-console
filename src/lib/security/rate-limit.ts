import 'server-only'

import { createHash } from 'node:crypto'

import { database } from '@/lib/database/client'
import { AppError } from '@/lib/security/error'

type RateLimit = {
  count: number
  expires: number
}

export function rateLimit(key: string, maximum: number, windowMs: number): void {
  const db = database()
  const now = Date.now()
  const expires = now + windowMs
  const id = createHash('sha256').update(key).digest('hex')

  db.prepare('DELETE FROM limits WHERE expires <= ?').run(now)

  const row = db
    .prepare(`
      INSERT INTO limits (id, count, expires)
      VALUES (?, 1, ?)
      ON CONFLICT (id) DO UPDATE SET count = count + 1
      RETURNING count, expires
    `)
    .get(id, expires) as RateLimit

  if (row.count > maximum) {
    throw new AppError(
      429,
      'Too many requests. Please try again later.',
      Math.max(1, Math.ceil((row.expires - now) / 1000))
    )
  }
}

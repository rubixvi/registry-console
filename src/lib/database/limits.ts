import 'server-only'

import { database } from '@/lib/database/client'
import { type RateLimit } from '@/types/limits'

const CLEANUP_INTERVAL = 60_000

let lastCleanup = 0

export function consumeLimit(id: string, now: number, expires: number): RateLimit {
  const db = database()

  if (now - lastCleanup >= CLEANUP_INTERVAL) {
    db.prepare('DELETE FROM limits WHERE expires <= ?').run(now)
    lastCleanup = now
  }

  return db
    .prepare(`
      INSERT INTO limits (id, count, expires)
      VALUES (?, 1, ?)
      ON CONFLICT (id) DO UPDATE SET
        count = CASE
          WHEN limits.expires <= ? THEN 1
          ELSE limits.count + 1
        END,
        expires = CASE
          WHEN limits.expires <= ? THEN excluded.expires
          ELSE limits.expires
        END
      RETURNING count, expires
    `)
    .get(id, expires, now, now) as RateLimit
}

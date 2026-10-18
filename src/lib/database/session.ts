import 'server-only'

import { database } from '@/lib/database/client'
import { type SessionRow } from '@/types/auth'

export function insertSession(row: SessionRow, now = Date.now()): void {
  const db = database()

  db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now)
  db.prepare(`
    INSERT INTO sessions (id, username, fingerprint, expires)
    VALUES (?, ?, ?, ?)
  `).run(row.id, row.username, row.fingerprint, row.expires)
}

export function getSession(id: string): SessionRow | undefined {
  return database()
    .prepare('SELECT * FROM sessions WHERE id = ? AND expires > ?')
    .get(id, Date.now()) as SessionRow | undefined
}

export function deleteSession(id: string): void {
  database().prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

export function clearSessions(username: string): void {
  database().prepare('DELETE FROM sessions WHERE username = ?').run(username)
}

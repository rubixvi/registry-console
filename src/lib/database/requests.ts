import 'server-only'

import { database } from '@/lib/database/client'
import { type AuthRequest, type Purpose, type RequestInput } from '@/types/security'

export function insertRequest(row: RequestInput): void {
  const db = database()

  db.prepare('DELETE FROM auth_requests WHERE expires <= ?').run(Date.now())
  db.prepare(`
    INSERT INTO auth_requests (id, purpose, username, fingerprint, session_id, value, expires)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.purpose, row.username, row.fingerprint, row.session_id, row.value, row.expires)
}

export function getRequest(id: string, purpose: Purpose, consume = false): AuthRequest | undefined {
  const statement =
    purpose === 'security'
      ? 'SELECT * FROM auth_requests WHERE id = ? AND purpose = ? AND expires > ?'
      : consume
        ? 'DELETE FROM auth_requests WHERE id = ? AND purpose = ? AND expires > ? RETURNING *'
        : 'UPDATE auth_requests SET attempts = attempts + 1 WHERE id = ? AND purpose = ? AND expires > ? AND attempts < 8 RETURNING *'

  return database().prepare(statement).get(id, purpose, Date.now()) as AuthRequest | undefined
}

export function consumeRequest(row: AuthRequest): boolean {
  const consumed = database()
    .prepare(`
      DELETE FROM auth_requests
      WHERE id = ? AND purpose = ? AND username = ? AND fingerprint = ? AND expires > ?
      RETURNING id
    `)
    .get(row.id, row.purpose, row.username, row.fingerprint, Date.now())

  return Boolean(consumed)
}

export function clearRequests(username: string): void {
  database().prepare('DELETE FROM auth_requests WHERE username = ?').run(username)
}

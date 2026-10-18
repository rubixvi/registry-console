import 'server-only'

import { database } from '@/lib/database/client'
import { type AuthenticatorRow } from '@/types/security'

export function findAuthenticator(
  username: string,
  fingerprint: string
): AuthenticatorRow | undefined {
  return database()
    .prepare('SELECT * FROM authenticators WHERE username = ? AND fingerprint = ?')
    .get(username, fingerprint) as AuthenticatorRow | undefined
}

export function insertAuthenticator(row: AuthenticatorRow): void {
  database()
    .prepare(`
      INSERT INTO authenticators (username, fingerprint, secret, last_step, recovery)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (username) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        secret = excluded.secret,
        last_step = excluded.last_step,
        recovery = excluded.recovery
    `)
    .run(row.username, row.fingerprint, row.secret, row.last_step, row.recovery)
}

export function updateStep(row: AuthenticatorRow, step: number): boolean {
  const result = database()
    .prepare(`
      UPDATE authenticators SET last_step = ?
      WHERE username = ? AND fingerprint = ? AND last_step = ?
    `)
    .run(step, row.username, row.fingerprint, row.last_step)

  return result.changes === 1
}

export function updateRecovery(row: AuthenticatorRow, remaining: string[]): boolean {
  const result = database()
    .prepare(`
      UPDATE authenticators SET recovery = ?
      WHERE username = ? AND fingerprint = ? AND recovery = ?
    `)
    .run(JSON.stringify(remaining), row.username, row.fingerprint, row.recovery)

  return result.changes === 1
}

export function deleteAuthenticator(username: string): void {
  database().prepare('DELETE FROM authenticators WHERE username = ?').run(username)
}

import 'server-only'

import { database } from '@/lib/database/client'
import { clearRequests } from '@/lib/database/requests'
import { clearSessions } from '@/lib/database/session'
import { type SecurityAccount } from '@/types/security'

export function getAccount(username: string): SecurityAccount | undefined {
  return database().prepare('SELECT * FROM security_accounts WHERE username = ?').get(username) as
    | SecurityAccount
    | undefined
}

export function accountNames(): string[] {
  const rows = database()
    .prepare(`
      SELECT username FROM security_accounts
      UNION SELECT username FROM authenticators
      UNION SELECT username FROM passkeys
    `)
    .all()

  return rows.map((row) => String(row.username))
}

export function insertAccount(row: SecurityAccount): void {
  database()
    .prepare(`
      INSERT INTO security_accounts (username, account_id, configured_id)
      VALUES (?, ?, ?)
    `)
    .run(row.username, row.account_id, row.configured_id)
}

export function clearAccount(username: string): void {
  const db = database()

  db.prepare('DELETE FROM passkeys WHERE username = ?').run(username)
  db.prepare('DELETE FROM authenticators WHERE username = ?').run(username)
  clearSessions(username)
  clearRequests(username)
  db.prepare('DELETE FROM security_accounts WHERE username = ?').run(username)
}

export function migrateAccount(username: string, id: string): boolean {
  const db = database()
  const keys = db
    .prepare('UPDATE passkeys SET fingerprint = ? WHERE username = ?')
    .run(id, username)
  const authenticator = db
    .prepare('UPDATE authenticators SET fingerprint = ? WHERE username = ?')
    .run(id, username)

  if (!keys.changes && !authenticator.changes) return false

  clearSessions(username)
  clearRequests(username)

  return true
}

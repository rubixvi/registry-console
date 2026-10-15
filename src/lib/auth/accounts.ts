import 'server-only'

import { randomUUID } from 'node:crypto'

import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
import { type User } from '@/types/auth'
import { type SecurityAccount } from '@/types/security'

function clearAccount(username: string): void {
  const db = database()

  db.prepare('DELETE FROM passkeys WHERE username = ?').run(username)
  db.prepare('DELETE FROM authenticators WHERE username = ?').run(username)
  db.prepare('DELETE FROM sessions WHERE username = ?').run(username)
  db.prepare('DELETE FROM auth_requests WHERE username = ?').run(username)
  db.prepare('DELETE FROM security_accounts WHERE username = ?').run(username)
}

export function securityId(user: User): string {
  const db = database()
  const select = db.prepare('SELECT * FROM security_accounts WHERE username = ?')
  const configuredId = user.id ?? ''
  const current = select.get(user.username) as SecurityAccount | undefined

  if (current?.configured_id === configuredId) {
    return current.account_id
  }

  const ownTransaction = !db.isTransaction

  if (ownTransaction) {
    db.exec('BEGIN IMMEDIATE')
  }

  try {
    const existing = select.get(user.username) as SecurityAccount | undefined

    if (existing?.configured_id === configuredId) {
      if (ownTransaction) {
        db.exec('COMMIT')
      }

      return existing.account_id
    }

    if (existing) {
      clearAccount(user.username)
      audit('system', 'security.account.replaced', user.username)
    }

    const accountId = randomUUID()

    db.prepare(`
      INSERT INTO security_accounts (username, account_id, configured_id)
      VALUES (?, ?, ?)
    `).run(user.username, accountId, configuredId)

    const keys = db
      .prepare('UPDATE passkeys SET fingerprint = ? WHERE username = ?')
      .run(accountId, user.username)
    const authenticator = db
      .prepare('UPDATE authenticators SET fingerprint = ? WHERE username = ?')
      .run(accountId, user.username)

    if (keys.changes || authenticator.changes) {
      db.prepare('DELETE FROM sessions WHERE username = ?').run(user.username)
      db.prepare('DELETE FROM auth_requests WHERE username = ?').run(user.username)
      audit('system', 'security.account.migrated', user.username)
    }

    if (ownTransaction) {
      db.exec('COMMIT')
    }

    return accountId
  } catch (error) {
    if (ownTransaction) {
      db.exec('ROLLBACK')
    }

    throw error
  }
}

export function securityAccounts(configured: User[]): void {
  const db = database()

  db.exec('BEGIN IMMEDIATE')

  try {
    const usernames = new Set(configured.map((user) => user.username))
    const accounts = db
      .prepare(`
        SELECT username FROM security_accounts
        UNION SELECT username FROM authenticators
        UNION SELECT username FROM passkeys
      `)
      .all() as { username: string }[]

    for (const { username } of accounts) {
      if (usernames.has(username)) {
        continue
      }

      clearAccount(username)
      audit('system', 'security.account.removed', username)
    }

    for (const user of configured) {
      securityId(user)
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }
}

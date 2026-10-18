import { existsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { transaction } from './helpers/transaction.mjs'

const username = process.argv[2]

if (process.argv.length !== 3 || !username || !/^[a-zA-Z0-9_.@-]{1,64}$/.test(username)) {
  throw new Error('Usage: node --env-file=.env scripts/reset-security.mjs USERNAME')
}

const filename = path.resolve(process.env.DATA_DIR || './data', 'console.sqlite')

if (!existsSync(filename)) {
  throw new Error('Database not found. Check DATA_DIR.')
}

const db = new DatabaseSync(filename)

try {
  db.exec('PRAGMA busy_timeout = 5000')

  transaction(db, () => {
    const links = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sso_links'")
      .get()

    if (links)
      db.prepare(
        'DELETE FROM sso_links WHERE account_id IN (SELECT account_id FROM security_accounts WHERE username = ?)'
      ).run(username)
    for (const table of [
      'passkeys',
      'authenticators',
      'sessions',
      'auth_requests',
      'security_accounts',
    ]) {
      const exists = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table)

      if (exists) {
        db.prepare(`DELETE FROM ${table} WHERE username = ?`).run(username)
      }
    }

    db.prepare(`
      INSERT INTO audit (at, actor, action, target)
      VALUES (?, 'operator', 'security.account.reset', ?)
    `).run(new Date().toISOString(), username)
  })
} finally {
  db.close()
}

console.log('Security reset. Sessions, passkeys, authenticator setup and SSO links cleared.')

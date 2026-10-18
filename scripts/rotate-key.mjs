import { existsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { decryptSecret, encryptionKey, encryptSecret, secretKeys } from './helpers/crypto.mjs'
import { transaction } from './helpers/transaction.mjs'

const filename = path.resolve(process.env.DATA_DIR || './data', 'console.sqlite')

if (!existsSync(filename)) throw new Error('Database not found. Check DATA_DIR.')

secretKeys()

const key = encryptionKey(process.env.ENCRYPTION_KEY)
const database = new DatabaseSync(filename)

try {
  database.exec('PRAGMA busy_timeout = 5000')
  transaction(database, () => {
    for (const [table, column, identity] of [
      ['registries', 'password', 'id'],
      ['authenticators', 'secret', 'username'],
    ]) {
      const rows = database
        .prepare(`SELECT ${identity} AS id, ${column} AS value FROM ${table}`)
        .all()

      for (const row of rows) {
        database
          .prepare(`UPDATE ${table} SET ${column} = ? WHERE ${identity} = ?`)
          .run(encryptSecret(decryptSecret(row.value), key), row.id)
      }
    }

    database
      .prepare('INSERT INTO audit (at, actor, action, target) VALUES (?, ?, ?, ?)')
      .run(
        new Date().toISOString(),
        'operator',
        'security.key.rotated',
        process.env.ENCRYPTION_KEY_ID || 'main'
      )
  })
} finally {
  database.close()
}

console.log('Stored registry and authenticator secrets now use the active encryption key.')

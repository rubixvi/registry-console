import 'server-only'

import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { env } from '@/lib/config/env'
import { DATABASE_SCHEMA } from '@/lib/database/schema'
import { transaction } from '@/lib/database/transaction'

let db: DatabaseSync | undefined

export function database(): DatabaseSync {
  if (db) return db

  const directory = path.resolve(env().DATA_DIR)
  const filename = path.join(directory, 'console.sqlite')

  mkdirSync(directory, { recursive: true, mode: 0o700 })

  const connection = new DatabaseSync(filename)

  try {
    chmodSync(filename, 0o600)
    connection.exec(DATABASE_SCHEMA)
    transaction(() => {
      const columns = connection.prepare('PRAGMA table_info(registries)').all() as {
        name: string
      }[]

      if (!columns.some((column) => column.name === 'pull_url')) {
        connection.exec("ALTER TABLE registries ADD COLUMN pull_url TEXT NOT NULL DEFAULT ''")
      }

      const additions = [
        ['revision', "TEXT NOT NULL DEFAULT ''"],
        ['provider', "TEXT NOT NULL DEFAULT 'distribution'"],
        ['namespace', "TEXT NOT NULL DEFAULT ''"],
      ] as const

      for (const [name, declaration] of additions) {
        if (!columns.some((column) => column.name === name)) {
          connection.exec(`ALTER TABLE registries ADD COLUMN ${name} ${declaration}`)
        }
      }

      const unversioned = connection
        .prepare("SELECT id FROM registries WHERE revision = ''")
        .all() as { id: string }[]

      for (const row of unversioned) {
        connection
          .prepare('UPDATE registries SET revision = ? WHERE id = ?')
          .run(randomUUID(), row.id)
      }

      const queue = connection.prepare('PRAGMA table_info(scan_queue)').all() as { name: string }[]

      if (!queue.some((column) => column.name === 'actor')) {
        connection.exec(
          "ALTER TABLE scan_queue ADD COLUMN actor TEXT NOT NULL DEFAULT 'system:trivy'"
        )
      }

      if (!queue.some((column) => column.name === 'override')) {
        connection.exec('ALTER TABLE scan_queue ADD COLUMN override INTEGER NOT NULL DEFAULT 0')
      }

      const accounts = connection.prepare('PRAGMA table_info(security_accounts)').all() as {
        name: string
      }[]

      if (!accounts.some((column) => column.name === 'email')) {
        connection.exec("ALTER TABLE security_accounts ADD COLUMN email TEXT NOT NULL DEFAULT ''")
      }

      connection.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS account_email ON security_accounts(email) WHERE email <> ''"
      )

      const auditColumns = connection.prepare('PRAGMA table_info(audit)').all() as {
        name: string
      }[]

      if (!auditColumns.some((column) => column.name === 'ip')) {
        connection.exec("ALTER TABLE audit ADD COLUMN ip TEXT NOT NULL DEFAULT ''")
      }
    }, connection)

    db = connection
    return connection
  } catch (error) {
    connection.close()
    throw error
  }
}

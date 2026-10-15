import 'server-only'

import { chmodSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { env } from '@/lib/config/env'
import { DATABASE_SCHEMA } from '@/lib/database/schema'

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
    connection.exec('BEGIN IMMEDIATE')

    try {
      const columns = connection.prepare('PRAGMA table_info(registries)').all() as {
        name: string
      }[]

      if (!columns.some((column) => column.name === 'pull_url')) {
        connection.exec("ALTER TABLE registries ADD COLUMN pull_url TEXT NOT NULL DEFAULT ''")
      }

      connection.exec('COMMIT')
    } catch (error) {
      connection.exec('ROLLBACK')

      throw error
    }

    db = connection
    return connection
  } catch (error) {
    connection.close()
    throw error
  }
}

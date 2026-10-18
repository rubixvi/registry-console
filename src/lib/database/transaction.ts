import 'server-only'

import { database } from '@/lib/database/client'

export function transaction<T>(operation: () => T): T {
  const db = database()

  if (db.isTransaction) return operation()

  db.exec('BEGIN IMMEDIATE')

  try {
    const result = operation()

    db.exec('COMMIT')

    return result
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }
}

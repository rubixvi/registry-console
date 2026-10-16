import 'server-only'

import { database } from '@/lib/database/client'

export function databaseReady(): boolean {
  try {
    database().prepare('SELECT 1').get()

    return true
  } catch {
    return false
  }
}

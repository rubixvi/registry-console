import 'server-only'

import { database } from '@/lib/database/client'
import { type PasskeyRow } from '@/types/security'

export function findPasskey(id: string): PasskeyRow | undefined {
  return database().prepare('SELECT * FROM passkeys WHERE id = ?').get(id) as PasskeyRow | undefined
}

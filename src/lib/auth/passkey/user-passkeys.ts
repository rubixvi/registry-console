import 'server-only'

import { securityId } from '@/lib/auth/accounts'
import { database } from '@/lib/database/client'
import { type User } from '@/types/auth'
import { type PasskeyRow } from '@/types/security'

export function userPasskeys(user: User): PasskeyRow[] {
  return database()
    .prepare(`
      SELECT * FROM passkeys WHERE username = ? AND fingerprint = ? ORDER BY created
    `)
    .all(user.username, securityId(user)) as PasskeyRow[]
}

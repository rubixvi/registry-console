import 'server-only'

import { securityId } from '@/lib/auth/accounts'
import { database } from '@/lib/database/client'
import { type User } from '@/types/auth'

export function removePasskey(user: User, id: string): void {
  database()
    .prepare('DELETE FROM passkeys WHERE id = ? AND username = ? AND fingerprint = ?')
    .run(id, user.username, securityId(user))
}

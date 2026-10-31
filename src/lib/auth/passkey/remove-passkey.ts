import 'server-only'

import { securityId } from '@/lib/auth/accounts'
import { deletePasskey } from '@/lib/database/passkey'
import { type User } from '@/types/auth'

export function removePasskey(user: User, id: string): void {
  deletePasskey({
    id,
    username: user.username,
    fingerprint: securityId(user),
  })
}

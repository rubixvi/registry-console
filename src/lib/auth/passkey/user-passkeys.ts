import 'server-only'

import { securityId } from '@/lib/auth/accounts'
import { listPasskeys } from '@/lib/database/passkey'
import { type User } from '@/types/auth'
import { type PasskeyRow } from '@/types/security'

export function userPasskeys(user: User): PasskeyRow[] {
  return listPasskeys({
    username: user.username,
    fingerprint: securityId(user),
  })
}

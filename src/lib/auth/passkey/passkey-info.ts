import 'server-only'

import { userPasskeys } from '@/lib/auth/passkey'
import { type User } from '@/types/auth'
import { type PasskeySummary } from '@/types/security'

export function passkeyInfo(user: User): PasskeySummary[] {
  return userPasskeys(user).map((row) => ({
    id: row.id,
    name: row.name,
    created: row.created,
    lastUsed: row.last_used,
  }))
}

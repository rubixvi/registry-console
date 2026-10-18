import 'server-only'

import { tokenHash } from '@/lib/auth/session/token-hash'
import { env } from '@/lib/config/env'
import { userFingerprint, users } from '@/lib/config/users'
import { getSession } from '@/lib/database/session'
import { tokenSchema } from '@/lib/validation/auth'
import { type Identity } from '@/types/auth'

export function resolveSession(token?: string): Identity | null {
  if (!token || !tokenSchema.safeParse(token).success) {
    return null
  }

  const row = getSession(tokenHash(token))

  if (!row) return null

  const user = users().find((user) => user.username === row.username)

  if (
    !user ||
    (user.authProvider === 'ldap' && env().LDAP_ENABLED !== 'true') ||
    row.fingerprint !== userFingerprint(user)
  ) {
    return null
  }

  return {
    username: user.username,
    role: user.role,
  }
}

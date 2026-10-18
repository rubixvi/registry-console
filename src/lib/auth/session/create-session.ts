import 'server-only'

import { randomBytes } from 'node:crypto'

import { tokenHash } from '@/lib/auth/session/token-hash'
import { env } from '@/lib/config/env'
import { userFingerprint } from '@/lib/config/users'
import { insertSession } from '@/lib/database/session'
import { type Session, type User } from '@/types/auth'

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

export function createSession(user: User): Session {
  const now = Date.now()
  const token = randomBytes(32).toString('base64url')
  const lifetime =
    user.authProvider === 'ldap'
      ? env().LDAP_SESSION_MINUTES * 60_000
      : env().SESSION_HOURS * MILLISECONDS_PER_HOUR

  const expires = now + lifetime

  insertSession(
    {
      id: tokenHash(token),
      username: user.username,
      fingerprint: userFingerprint(user),
      expires,
    },
    now
  )

  return { token, expires }
}

import 'server-only'

import { securityId } from '@/lib/auth/accounts'
import { findAuthenticator } from '@/lib/database/authenticator'
import { type User } from '@/types/auth'
import { type AuthenticatorRow } from '@/types/security'

export function getAuthenticator(user: User): AuthenticatorRow | undefined {
  return findAuthenticator(user.username, securityId(user))
}

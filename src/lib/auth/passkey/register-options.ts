import 'server-only'

import { randomBytes } from 'node:crypto'
import { type AuthenticatorTransport, generateRegistrationOptions } from '@simplewebauthn/server'

import { passkeyHost, userPasskeys } from '@/lib/auth/passkey'
import { env } from '@/lib/config/env'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'

export async function registerOptions(user: User) {
  if (user.authProvider === 'ldap' || user.authProvider === 'sso') {
    throw new AppError(
      403,
      user.authProvider === 'ldap'
        ? 'Directory accounts must sign in with their directory password.'
        : 'SSO accounts must sign in with their configured provider.'
    )
  }

  const keys = userPasskeys(user)

  if (keys.length >= 10) {
    throw new AppError(400, 'Remove an existing passkey before adding another.')
  }

  const userId = keys[0]?.user_id ?? randomBytes(32).toString('hex')
  const options = await generateRegistrationOptions({
    rpName: env().BRAND_NAME,
    rpID: passkeyHost().rpID,
    userID: new Uint8Array(Buffer.from(userId, 'hex')),
    userName: user.username,
    attestationType: 'none',
    excludeCredentials: keys.map((key) => ({
      id: key.id,
      transports: JSON.parse(key.transports) as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  })

  return { options, userId }
}

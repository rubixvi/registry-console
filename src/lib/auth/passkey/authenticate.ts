import 'server-only'

import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'

import { securityId } from '@/lib/auth/accounts'
import { findPasskey, passkeyHost } from '@/lib/auth/passkey'
import { updatePasskey } from '@/lib/database/passkey'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'

export async function authenticatePasskey(
  user: User,
  response: AuthenticationResponseJSON,
  challenge: string
): Promise<void> {
  const key = findPasskey(response.id)

  if (
    user.authProvider === 'ldap' ||
    user.authProvider === 'sso' ||
    !key ||
    key.username !== user.username ||
    key.fingerprint !== securityId(user) ||
    response.response.userHandle !== Buffer.from(key.user_id, 'hex').toString('base64url')
  ) {
    throw new AppError(401, 'Passkey sign-in could not be verified.')
  }

  const { origin, rpID } = passkeyHost()

  let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>

  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: key.id,
        publicKey: new Uint8Array(Buffer.from(key.public_key, 'base64url')),
        counter: key.counter,
        transports: JSON.parse(key.transports) as AuthenticatorTransport[],
      },
    })
  } catch {
    throw new AppError(401, 'Passkey sign-in could not be verified. Please try again.')
  }

  if (!result.verified) {
    throw new AppError(401, 'Passkey sign-in could not be verified.')
  }

  const updated = updatePasskey({
    id: key.id,
    fingerprint: key.fingerprint,
    counter: result.authenticationInfo.newCounter,
    previous: key.counter,
  })

  if (!updated) {
    throw new AppError(401, 'Passkey changed. Please try again.')
  }
}

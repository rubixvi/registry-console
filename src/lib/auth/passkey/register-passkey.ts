import 'server-only'

import { type RegistrationResponseJSON, verifyRegistrationResponse } from '@simplewebauthn/server'

import { securityId } from '@/lib/auth/accounts'
import { findPasskey, passkeyHost, userPasskeys } from '@/lib/auth/passkey'
import { database } from '@/lib/database/client'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'

export async function registerPasskey(
  user: User,
  response: RegistrationResponseJSON,
  challenge: string,
  userId: string,
  name: string
): Promise<void> {
  if (user.authProvider === 'ldap') {
    throw new AppError(403, 'Passkeys are unavailable for directory accounts.')
  }

  const { origin, rpID } = passkeyHost()
  let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>

  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch {
    throw new AppError(400, 'Passkey registration could not be verified. Please try again.')
  }

  if (!result.verified || !result.registrationInfo) {
    throw new AppError(400, 'Passkey registration could not be verified.')
  }

  if (findPasskey(response.id)) {
    throw new AppError(400, 'This passkey is already registered.')
  }

  if (userPasskeys(user).length >= 10) {
    throw new AppError(400, 'Passkey limit reached.')
  }

  const { credential } = result.registrationInfo

  database()
    .prepare(`
      INSERT INTO passkeys (id, username, fingerprint, user_id, public_key, counter, transports, name, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      credential.id,
      user.username,
      securityId(user),
      userId,
      Buffer.from(credential.publicKey).toString('base64url'),
      credential.counter,
      JSON.stringify(credential.transports ?? []),
      name,
      new Date().toISOString()
    )
}

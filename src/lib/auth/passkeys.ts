import 'server-only'

import { randomBytes } from 'node:crypto'
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'

import { securityId } from '@/lib/auth/accounts'
import { env } from '@/lib/config/env'
import { database } from '@/lib/database/client'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'
import { type PasskeyRow, type PasskeySummary } from '@/types/security'

function passkeyHost() {
  const origin = env().APP_ORIGIN

  return { origin, rpID: new URL(origin).hostname }
}

export function userPasskeys(user: User): PasskeyRow[] {
  return database()
    .prepare(`
      SELECT * FROM passkeys WHERE username = ? AND fingerprint = ? ORDER BY created
    `)
    .all(user.username, securityId(user)) as PasskeyRow[]
}

export function passkeySummaries(user: User): PasskeySummary[] {
  return userPasskeys(user).map((row) => ({
    id: row.id,
    name: row.name,
    created: row.created,
    lastUsed: row.last_used,
  }))
}

export function findPasskey(id: string): PasskeyRow | undefined {
  return database().prepare('SELECT * FROM passkeys WHERE id = ?').get(id) as PasskeyRow | undefined
}

export async function regOptions(user: User) {
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

export async function registerPasskey(
  user: User,
  response: RegistrationResponseJSON,
  challenge: string,
  userId: string,
  name: string
): Promise<void> {
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

export async function authenticationOptions() {
  return generateAuthenticationOptions({
    rpID: passkeyHost().rpID,
    userVerification: 'required',
  })
}

export async function authPasskey(
  user: User,
  response: AuthenticationResponseJSON,
  challenge: string
): Promise<void> {
  const key = findPasskey(response.id)

  if (
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

  const update = database()
    .prepare(`
      UPDATE passkeys SET counter = ?, last_used = ?
      WHERE id = ? AND fingerprint = ? AND counter = ?
    `)
    .run(
      result.authenticationInfo.newCounter,
      new Date().toISOString(),
      key.id,
      key.fingerprint,
      key.counter
    )

  if (update.changes !== 1) {
    throw new AppError(401, 'Passkey changed. Please try again.')
  }
}

import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

import { env } from '@/lib/config/env'
import { userFingerprint, users } from '@/lib/config/users'
import { deleteSession, getSession, insertSession } from '@/lib/database/session'
import { tokenSchema } from '@/lib/validation/auth'
import { type Identity, type Session, type User } from '@/types/auth'

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

export function sessionCookieName(): string {
  const secure = new URL(env().APP_ORIGIN).protocol === 'https:'

  if (secure) return '__Host-registry_session'

  return 'registry_session'
}

export function cookieOptions() {
  const secure = new URL(env().APP_ORIGIN).protocol === 'https:'

  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
  }
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

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

export async function getIdentity(): Promise<Identity | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName())?.value

  return resolveSession(token)
}

export async function revokeSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName())?.value

  if (!token) return

  deleteSession(tokenHash(token))
}

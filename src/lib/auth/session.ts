import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

import { env } from '@/lib/config/env'
import { userFingerprint, users } from '@/lib/config/users'
import { database } from '@/lib/database/client'
import { type Identity, type Session, type SessionRow, type User } from '@/types/auth'

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
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
  const db = database()
  const now = Date.now()
  const token = randomBytes(32).toString('base64url')
  const lifetime =
    user.authProvider === 'ldap'
      ? env().LDAP_SESSION_MINUTES * 60_000
      : env().SESSION_HOURS * MILLISECONDS_PER_HOUR

  const expires = now + lifetime

  db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now)

  db.prepare(`
    INSERT INTO sessions (id, username, fingerprint, expires)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash(token), user.username, userFingerprint(user), expires)

  return { token, expires }
}

export function resolveSession(token?: string): Identity | null {
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) {
    return null
  }

  const row = database()
    .prepare(`
      SELECT * FROM sessions
      WHERE id = ? AND expires > ?
    `)
    .get(tokenHash(token), Date.now()) as SessionRow | undefined

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

  database().prepare('DELETE FROM sessions WHERE id = ?').run(tokenHash(token))
}

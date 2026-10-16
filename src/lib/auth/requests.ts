import 'server-only'

import { randomBytes } from 'node:crypto'
import { type NextResponse } from 'next/server'

import { cookieOptions, sessionCookieName, tokenHash } from '@/lib/auth/session'
import { userFingerprint, users } from '@/lib/config/users'
import { database } from '@/lib/database/client'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'
import { type AuthRequest, type Purpose } from '@/types/security'

function cookieName(purpose: Purpose): string {
  return `${cookieOptions().secure ? '__Host-' : ''}registry_${purpose}`
}

function cookieValue(request: Request, name: string): string {
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .find((part) => part.trim().startsWith(`${name}=`))

  return cookie?.trim().slice(name.length + 1) ?? ''
}

export function sessionId(request: Request): string {
  return tokenHash(cookieValue(request, sessionCookieName()))
}

export function issueRequest(
  response: NextResponse,
  purpose: Purpose,
  user: User | null,
  value = '',
  session = ''
): void {
  const token = randomBytes(32).toString('base64url')
  const expires = Date.now() + 5 * 60_000
  const db = database()

  db.prepare('DELETE FROM auth_requests WHERE expires <= ?').run(Date.now())

  db.prepare(`
    INSERT INTO auth_requests (id, purpose, username, fingerprint, session_id, value, expires)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tokenHash(token),
    purpose,
    user?.username ?? '',
    user ? userFingerprint(user) : '',
    session,
    value,
    expires
  )

  response.cookies.set(cookieName(purpose), token, {
    ...cookieOptions(),
    expires: new Date(expires),
  })
}

export function readRequest(request: Request, purpose: Purpose, consume = false): AuthRequest {
  const token = cookieValue(request, cookieName(purpose))

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new AppError(400, 'Verification expired. Please start again.')
  }

  const db = database()
  const statement =
    purpose === 'security'
      ? 'SELECT * FROM auth_requests WHERE id = ? AND purpose = ? AND expires > ?'
      : consume
        ? 'DELETE FROM auth_requests WHERE id = ? AND purpose = ? AND expires > ? RETURNING *'
        : 'UPDATE auth_requests SET attempts = attempts + 1 WHERE id = ? AND purpose = ? AND expires > ? AND attempts < 8 RETURNING *'

  const row = db.prepare(statement).get(tokenHash(token), purpose, Date.now()) as
    | AuthRequest
    | undefined

  if (!row || row.attempts > 8) {
    throw new AppError(400, 'Verification expired. Please start again.')
  }

  if (row.username) {
    const user = users().find((entry) => entry.username === row.username)

    if (!user || row.fingerprint !== userFingerprint(user)) {
      throw new AppError(401, 'Account configuration changed. Sign in again.')
    }
  }

  if (row.session_id && row.session_id !== sessionId(request)) {
    throw new AppError(403, 'Verification does not belong to this session.')
  }

  return row
}

export function requireSecurity(request: Request, username: string): void {
  const grant = readRequest(request, 'security')

  if (grant.username !== username || !grant.session_id) {
    throw new AppError(403, 'Verify your identity before changing security settings.')
  }
}

export function clearRequest(response: NextResponse, purpose: Purpose): void {
  response.cookies.set(cookieName(purpose), '', {
    ...cookieOptions(),
    maxAge: 0,
  })
}

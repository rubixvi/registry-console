import { NextResponse } from 'next/server'

import { securityId } from '@/lib/auth/accounts'
import { clearRequest, readRequest, requireSecurity } from '@/lib/auth/requests'
import { cookieOptions, createSession, sessionCookieName } from '@/lib/auth/session'
import { getAuthenticator, recoveryCodes, recoveryHash, totpStep } from '@/lib/auth/totp'
import { configUser } from '@/lib/auth/verification'
import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
import { api } from '@/lib/security/api'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson } from '@/lib/security/request'
import { codeInput } from '@/lib/validation/security'

export const POST = api(async (request, _context, identity) => {
  requireSecurity(request, identity.username)
  rateLimit(`totp-enroll:${identity.username}`, 8, 15 * 60_000)

  const { code } = await readJson(request, codeInput)
  const pending = readRequest(request, 'totp-setup')
  const user = configUser(identity.username)

  if (pending.username !== user.username) {
    throw new AppError(403, 'Invalid authenticator setup.')
  }

  if (getAuthenticator(user)) {
    throw new AppError(400, 'Authenticator is already enabled.')
  }

  const step = totpStep(decryptSecret(pending.value), code)

  if (step === null) {
    throw new AppError(400, 'Invalid authenticator code.')
  }

  const codes = recoveryCodes()
  const db = database()
  const response = NextResponse.json({ recoveryCodes: codes })

  db.exec('BEGIN IMMEDIATE')

  try {
    const consumed = db
      .prepare('DELETE FROM auth_requests WHERE id = ? RETURNING id')
      .get(pending.id)

    if (!consumed) {
      throw new AppError(400, 'Authenticator setup expired. Please start again.')
    }

    if (getAuthenticator(user)) {
      throw new AppError(400, 'Authenticator is already enabled.')
    }

    db.prepare(`
      INSERT INTO authenticators (username, fingerprint, secret, last_step, recovery)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (username) DO UPDATE SET
        fingerprint = excluded.fingerprint,
        secret = excluded.secret,
        last_step = excluded.last_step,
        recovery = excluded.recovery
    `).run(
      user.username,
      securityId(user),
      pending.value,
      step,
      JSON.stringify(codes.map(recoveryHash))
    )

    db.prepare('DELETE FROM sessions WHERE username = ?').run(user.username)
    db.prepare('DELETE FROM auth_requests WHERE username = ?').run(user.username)

    const session = createSession(user)

    response.cookies.set(sessionCookieName(), session.token, {
      ...cookieOptions(),
      expires: new Date(session.expires),
    })

    audit(user.username, 'security.totp.enabled', '')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }

  clearRequest(response, 'totp-setup')
  clearRequest(response, 'security')

  return response
})

export const DELETE = api(async (request, _context, identity) => {
  requireSecurity(request, identity.username)

  const db = database()

  db.exec('BEGIN IMMEDIATE')

  try {
    db.prepare('DELETE FROM authenticators WHERE username = ?').run(identity.username)
    db.prepare('DELETE FROM auth_requests WHERE username = ?').run(identity.username)
    db.prepare('DELETE FROM sessions WHERE username = ?').run(identity.username)
    audit(identity.username, 'security.totp.disabled', '')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }

  const response = NextResponse.json({ success: true })

  response.cookies.set(sessionCookieName(), '', { ...cookieOptions(), maxAge: 0 })
  clearRequest(response, 'security')

  return response
})

import 'server-only'

import { securityId } from '@/lib/auth/accounts'
import { createSession } from '@/lib/auth/session'
import { getAuthenticator, recoveryCodes, recoveryHash, totpStep } from '@/lib/auth/totp'
import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { type Session, type User } from '@/types/auth'
import { type AuthRequest } from '@/types/security'

type Enrollment = {
  codes: string[]
  session: Session
}

export function enableAuthenticator(user: User, pending: AuthRequest, code: string): Enrollment {
  if (pending.purpose !== 'totp-setup' || pending.username !== user.username) {
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

  db.exec('BEGIN IMMEDIATE')

  try {
    const consumed = db
      .prepare(`
        DELETE FROM auth_requests
        WHERE id = ? AND purpose = 'totp-setup' AND username = ?
          AND fingerprint = ? AND expires > ?
        RETURNING id
      `)
      .get(pending.id, user.username, pending.fingerprint, Date.now())

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

    audit(user.username, 'security.totp.enabled', '')
    db.exec('COMMIT')

    return { codes, session }
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }
}

export function disableAuthenticator(username: string): void {
  const db = database()

  db.exec('BEGIN IMMEDIATE')

  try {
    db.prepare('DELETE FROM authenticators WHERE username = ?').run(username)
    db.prepare('DELETE FROM auth_requests WHERE username = ?').run(username)
    db.prepare('DELETE FROM sessions WHERE username = ?').run(username)

    audit(username, 'security.totp.disabled', '')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }
}

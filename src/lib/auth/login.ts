import 'server-only'

import { type NextResponse } from 'next/server'

import { loginResponse } from '@/lib/auth/response'
import { verifySecondFactor } from '@/lib/auth/totp'
import { database } from '@/lib/database/client'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'
import { type AuthRequest } from '@/types/security'

export function verifyLogin(user: User, pending: AuthRequest, code: string): NextResponse {
  if (pending.purpose !== 'two-factor' || pending.username !== user.username) {
    throw new AppError(400, 'Verification expired. Please sign in again.')
  }

  const db = database()

  db.exec('BEGIN IMMEDIATE')

  try {
    const consumed = db
      .prepare(`
        DELETE FROM auth_requests
        WHERE id = ? AND purpose = 'two-factor' AND username = ?
          AND fingerprint = ? AND expires > ?
        RETURNING id
      `)
      .get(pending.id, user.username, pending.fingerprint, Date.now())

    if (!consumed) {
      throw new AppError(400, 'Verification expired. Please sign in again.')
    }

    verifySecondFactor(user, code)

    const response = loginResponse(user, 'two_factor')

    db.exec('COMMIT')

    return response
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }
}

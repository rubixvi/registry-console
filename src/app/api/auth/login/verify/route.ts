import { type NextRequest, type NextResponse } from 'next/server'

import { auditAuthFailure } from '@/lib/auth/audit'
import { limitSignIn } from '@/lib/auth/limit'
import { readRequest } from '@/lib/auth/requests'
import { loginResponse } from '@/lib/auth/response'
import { verifySecondFactor } from '@/lib/auth/totp'
import { configUser } from '@/lib/auth/verification'
import { database } from '@/lib/database/client'
import { apiError } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson, requireOrigin } from '@/lib/security/request'
import { codeInput } from '@/lib/validation/security'

export async function POST(request: NextRequest): Promise<NextResponse> {
  let actor = 'anonymous'

  try {
    requireOrigin(request)
    limitSignIn(request, 'two-factor')

    const { code } = await readJson(request, codeInput)
    const pending = readRequest(request, 'two-factor')

    actor = pending.username

    rateLimit(`two-factor-user:${pending.username}`, 8, 15 * 60_000)

    const user = configUser(pending.username)
    const db = database()

    db.exec('BEGIN IMMEDIATE')

    try {
      const consumed = db
        .prepare('DELETE FROM auth_requests WHERE id = ? RETURNING id')
        .get(pending.id)

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
  } catch (error) {
    auditAuthFailure(actor, 'login.two_factor.failed', error)

    return apiError(error)
  }
}

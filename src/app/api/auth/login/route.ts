import { type NextRequest, NextResponse } from 'next/server'

import { auditAuthFailure } from '@/lib/auth/audit'
import { verifyCredentials } from '@/lib/auth/credentials'
import { limitSignIn } from '@/lib/auth/limit'
import { issueRequest } from '@/lib/auth/requests'
import { loginResponse } from '@/lib/auth/response'
import { getAuthenticator } from '@/lib/auth/totp'
import { users } from '@/lib/config/users'
import { apiError } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { createGate } from '@/lib/security/gate'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson, requireOrigin } from '@/lib/security/request'
import { loginInput } from '@/lib/validation/auth'

const LOGIN_WINDOW_MS = 15 * 60_000
const MAX_USER_ATTEMPTS = 8
const enter = createGate(3, 1)

export async function POST(request: NextRequest) {
  let actor = 'anonymous'

  try {
    requireOrigin(request)

    const source = limitSignIn(request)

    const { username, password } = await readJson(request, loginInput)

    rateLimit(`login-user:${username}:${source}`, MAX_USER_ATTEMPTS, LOGIN_WINDOW_MS)

    const user = users().find((user) => user.username === username)

    actor = user?.username ?? 'anonymous'

    let valid: boolean
    const release = await enter(user?.role === 'admin')

    try {
      valid = await verifyCredentials(password, user)
    } finally {
      release()
    }

    if (!user || !valid) {
      throw new AppError(401, 'Invalid username or password.')
    }

    if (getAuthenticator(user)) {
      const response = NextResponse.json(
        { requiresTwoFactor: true },
        { headers: { 'Cache-Control': 'no-store' } }
      )

      issueRequest(response, 'two-factor', user)

      return response
    }

    return loginResponse(user, 'success')
  } catch (error) {
    auditAuthFailure(actor, 'login.password.failed', error)

    return apiError(error)
  }
}

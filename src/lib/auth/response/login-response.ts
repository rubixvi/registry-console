import 'server-only'

import { NextResponse } from 'next/server'

import { clearRequest } from '@/lib/auth/requests'
import { cookieOptions, createSession, sessionCookieName } from '@/lib/auth/session'
import { audit } from '@/lib/database/audit'
import { type User } from '@/types/auth'

export function loginResponse(user: User, method: string): NextResponse {
  const session = createSession(user)
  const response = NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } }
  )

  response.cookies.set(sessionCookieName(), session.token, {
    ...cookieOptions(),
    ...(method.startsWith('sso.') ? { sameSite: 'lax' as const } : {}),
    expires: new Date(session.expires),
  })

  clearRequest(response, 'two-factor')
  clearRequest(response, 'passkey-login')
  audit(user.username, `login.${method}`, '')

  return response
}

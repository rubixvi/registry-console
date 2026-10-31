import { NextResponse } from 'next/server'

import { cookieOptions, revokeSession, sessionCookieName } from '@/lib/auth/session'
import { apiRequest } from '@/lib/security/api'

export const POST = apiRequest(async () => {
  await revokeSession()

  const response = NextResponse.json({ success: true })

  response.cookies.set(sessionCookieName(), '', {
    ...cookieOptions(),
    maxAge: 0,
  })

  return response
})

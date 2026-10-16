import { NextResponse } from 'next/server'

import { disableAuthenticator, enableAuthenticator } from '@/lib/auth/authenticator'
import { clearRequest, readRequest, requireSecurity } from '@/lib/auth/requests'
import { cookieOptions, sessionCookieName } from '@/lib/auth/session'
import { configUser } from '@/lib/auth/verification'
import { api } from '@/lib/security/api'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson } from '@/lib/security/request'
import { codeInput } from '@/lib/validation/security'

export const POST = api(async (request, _context, identity) => {
  requireSecurity(request, identity.username)
  rateLimit(`totp-enroll:${identity.username}`, 8, 15 * 60_000)

  const { code } = await readJson(request, codeInput)
  const pending = readRequest(request, 'totp-setup')
  const user = configUser(identity.username)
  const { codes, session } = enableAuthenticator(user, pending, code)
  const response = NextResponse.json({ recoveryCodes: codes })

  response.cookies.set(sessionCookieName(), session.token, {
    ...cookieOptions(),
    expires: new Date(session.expires),
  })

  clearRequest(response, 'totp-setup')
  clearRequest(response, 'security')

  return response
})

export const DELETE = api(async (request, _context, identity) => {
  requireSecurity(request, identity.username)
  disableAuthenticator(identity.username)

  const response = NextResponse.json({ success: true })

  response.cookies.set(sessionCookieName(), '', { ...cookieOptions(), maxAge: 0 })
  clearRequest(response, 'security')

  return response
})

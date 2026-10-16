import { NextResponse } from 'next/server'

import { registerOptions } from '@/lib/auth/passkey'
import { issueRequest, requireSecurity, sessionId } from '@/lib/auth/requests'
import { configUser } from '@/lib/auth/verification'
import { api } from '@/lib/security/api'

export const POST = api(async (request, _context, identity) => {
  requireSecurity(request, identity.username)

  const user = configUser(identity.username)
  const { options, userId } = await registerOptions(user)
  const response = NextResponse.json(options)

  issueRequest(
    response,
    'passkey-register',
    user,
    JSON.stringify({ challenge: options.challenge, userId }),
    sessionId(request)
  )

  return response
})

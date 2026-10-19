import { type NextRequest, NextResponse } from 'next/server'

import { auditRequest } from '@/lib/audit'
import { limitSignIn } from '@/lib/auth/limit'
import { authenticationOptions } from '@/lib/auth/passkey'
import { issueRequest } from '@/lib/auth/requests'
import { apiError } from '@/lib/security/api'
import { requireOrigin } from '@/lib/security/request'

export const POST = auditRequest(async (request: NextRequest): Promise<NextResponse> => {
  try {
    requireOrigin(request)
    limitSignIn(request, 'passkey')

    const options = await authenticationOptions()
    const response = NextResponse.json(options, {
      headers: { 'Cache-Control': 'no-store' },
    })

    issueRequest(response, 'passkey-login', null, options.challenge)

    return response
  } catch (error) {
    return apiError(error)
  }
})

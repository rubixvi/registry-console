import { type NextRequest, type NextResponse } from 'next/server'

import { auditRequest } from '@/lib/audit'
import { auditAuthFailure } from '@/lib/auth/audit'
import { refreshDirectory } from '@/lib/auth/directory'
import { limitSignIn } from '@/lib/auth/limit'
import { verifyLogin } from '@/lib/auth/login'
import { readRequest } from '@/lib/auth/requests'
import { configUser } from '@/lib/auth/verification'
import { apiError } from '@/lib/security/api'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson, requireOrigin } from '@/lib/security/request'
import { codeInput } from '@/lib/validation/security'

export const POST = auditRequest(async (request: NextRequest): Promise<NextResponse> => {
  let actor = 'anonymous'

  try {
    requireOrigin(request)
    const source = limitSignIn(request, 'two-factor')

    const { code } = await readJson(request, codeInput)
    const pending = readRequest(request, 'two-factor')

    actor = pending.username

    rateLimit(`two-factor-user:${pending.username}:${source}`, 8, 15 * 60_000)

    const user = configUser(pending.username)

    await refreshDirectory(user)

    return verifyLogin(user, pending, code)
  } catch (error) {
    auditAuthFailure(actor, 'login.two_factor.failed', error)

    return apiError(error)
  }
})

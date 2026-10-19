import { type NextRequest, type NextResponse } from 'next/server'

import { auditRequest } from '@/lib/audit'
import { auditAuthFailure } from '@/lib/auth/audit'
import { limitSignIn } from '@/lib/auth/limit'
import { authenticatePasskey, findPasskey } from '@/lib/auth/passkey'
import { readRequest } from '@/lib/auth/requests'
import { loginResponse } from '@/lib/auth/response'
import { configUser } from '@/lib/auth/verification'
import { apiError } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson, requireOrigin } from '@/lib/security/request'
import { passkeyAuthenticationInput } from '@/lib/validation/security'

export const POST = auditRequest(async (request: NextRequest): Promise<NextResponse> => {
  let actor = 'anonymous'

  try {
    requireOrigin(request)
    const source = limitSignIn(request, 'passkey')

    const credential = await readJson(request, passkeyAuthenticationInput)
    const pending = readRequest(request, 'passkey-login', true)
    const key = findPasskey(credential.id)

    if (!key) {
      throw new AppError(401, 'Passkey sign-in could not be verified.')
    }

    rateLimit(`passkey-user:${key.username}:${source}`, 15, 15 * 60_000)

    const user = configUser(key.username)

    actor = user.username

    await authenticatePasskey(user, credential, pending.value)

    return loginResponse(user, 'passkey')
  } catch (error) {
    auditAuthFailure(actor, 'login.passkey.failed', error)

    return apiError(error)
  }
})

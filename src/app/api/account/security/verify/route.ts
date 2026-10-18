import { NextResponse } from 'next/server'

import { issueRequest, readRequest, sessionId } from '@/lib/auth/requests'
import { getAuthenticator, verifySecondFactor } from '@/lib/auth/totp'
import { configUser, verifyAccount } from '@/lib/auth/verification'
import { audit } from '@/lib/database/audit'
import { transaction } from '@/lib/database/transaction'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson } from '@/lib/security/request'
import { verificationInput } from '@/lib/validation/security'

export const POST = api(async (request, _context, identity) => {
  const { password, code } = await readJson(request, verificationInput)

  const user = password
    ? await verifyAccount(identity.username, password, code)
    : configUser(identity.username)

  if (!password) rateLimit(`security-verify:${identity.username}`, 8, 15 * 60_000)

  return transaction(() => {
    if (!password) {
      const pending = readRequest(request, 'sso-verify', true)

      if (pending.username !== identity.username)
        throw new AppError(403, 'Account verification does not match.')
      if (getAuthenticator(user)) verifySecondFactor(user, code ?? '')
    }

    const response = NextResponse.json({ success: true })

    issueRequest(response, 'security', user, '', sessionId(request))
    audit(identity.username, 'security.verify.success', '')

    return response
  })
})

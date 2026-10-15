import { NextResponse } from 'next/server'

import { issueRequest, sessionId } from '@/lib/auth/requests'
import { verifyAccount } from '@/lib/auth/verification'
import { audit } from '@/lib/database/audit'
import { api } from '@/lib/security/api'
import { readJson } from '@/lib/security/request'
import { verificationInput } from '@/lib/validation/security'

export const POST = api(async (request, _context, identity) => {
  const { password, code } = await readJson(request, verificationInput)
  const user = await verifyAccount(identity.username, password, code)
  const response = NextResponse.json({ success: true })

  issueRequest(response, 'security', user, '', sessionId(request))
  audit(identity.username, 'security.verify.success', '')

  return response
})

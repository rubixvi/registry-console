import { NextResponse } from 'next/server'

import { registerPasskey } from '@/lib/auth/passkeys'
import { clearRequest, readRequest, requireSecurity } from '@/lib/auth/requests'
import { configUser } from '@/lib/auth/verification'
import { audit } from '@/lib/database/audit'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson } from '@/lib/security/request'
import { passkeyRegistrationInput } from '@/lib/validation/security'

export const POST = api(async (request, _context, identity) => {
  requireSecurity(request, identity.username)
  rateLimit(`passkey-enroll:${identity.username}`, 15, 15 * 60_000)

  const { name, credential } = await readJson(request, passkeyRegistrationInput)
  const pending = readRequest(request, 'passkey-register', true)
  const user = configUser(identity.username)

  if (pending.username !== user.username || !pending.session_id) {
    throw new AppError(403, 'Invalid passkey registration request.')
  }

  const { challenge, userId } = JSON.parse(pending.value) as {
    challenge: string
    userId: string
  }

  await registerPasskey(user, credential, challenge, userId, name)

  audit(identity.username, 'security.passkey.added', credential.id)

  const response = NextResponse.json({ success: true })

  clearRequest(response, 'passkey-register')

  return response
})
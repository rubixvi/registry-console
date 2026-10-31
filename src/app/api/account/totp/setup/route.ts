import { NextResponse } from 'next/server'
import QRCode from 'qrcode'

import { issueRequest, requireSecurity, sessionId } from '@/lib/auth/requests'
import { generateTotpSecret, getAuthenticator } from '@/lib/auth/totp'
import { configUser } from '@/lib/auth/verification'
import { env } from '@/lib/config/env'
import { apiRequest } from '@/lib/security/api'
import { encryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'

export const POST = apiRequest(async (request, _context, identity) => {
  requireSecurity(request, identity.username)

  const user = configUser(identity.username)

  if (getAuthenticator(user)) {
    throw new AppError(400, 'Authenticator is already enabled.')
  }

  const secret = generateTotpSecret()
  const issuer = env().BRAND_NAME
  const label = encodeURIComponent(`${issuer}:${user.username}`)

  const parameters = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })

  const qrCode = await QRCode.toDataURL(`otpauth://totp/${label}?${parameters}`, {
    width: 240,
    margin: 2,
  })

  const response = NextResponse.json({ secret, qrCode })

  issueRequest(response, 'totp-setup', user, encryptSecret(secret), sessionId(request))

  return response
})

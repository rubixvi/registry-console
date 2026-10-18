import { randomBytes } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import * as client from 'openid-client'

import { limitSignIn } from '@/lib/auth/limit'
import { issueRequest, sessionId } from '@/lib/auth/requests'
import { cookieValue } from '@/lib/auth/requests/cookie-value'
import { cookieOptions, getIdentity, sessionCookieName } from '@/lib/auth/session'
import { ssoConfig, ssoProviders } from '@/lib/auth/sso'
import { configUser } from '@/lib/auth/verification'
import { env } from '@/lib/config/env'
import { userFingerprint } from '@/lib/config/users'
import { getSession } from '@/lib/database/session'
import { apiError } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { readJson, requireOrigin } from '@/lib/security/request'
import { providerName, ssoInput } from '@/lib/validation/sso'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  try {
    requireOrigin(request)
    limitSignIn(request, 'sso')

    const id = providerName.parse((await context.params).provider)
    const provider = ssoProviders().find((entry) => entry.id === id)

    if (!provider) throw new AppError(404, 'SSO provider is not configured.')

    const { action } = await readJson(request, ssoInput)
    const identity = action === 'verify' ? await getIdentity() : null

    if (action === 'verify' && !identity) throw new AppError(401, 'Sign in to verify your account.')

    const user = identity ? configUser(identity.username) : null
    const config = await ssoConfig(provider)
    const state = randomBytes(32).toString('base64url')
    const verifier = client.randomPKCECodeVerifier()
    const nonce = client.randomNonce()
    const callback = `${env().APP_ORIGIN}/api/auth/sso/${id}/callback`

    const target = client.buildAuthorizationUrl(config, {
      redirect_uri: callback,
      response_type: 'code',
      scope: id === 'github' ? 'read:user user:email' : 'openid email profile',
      state,
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      ...(id !== 'github' ? { nonce } : {}),
      ...(action === 'verify' && id !== 'github' ? { prompt: 'login', max_age: '0' } : {}),
    })

    const response = NextResponse.json(
      { url: target.href },
      { headers: { 'Cache-Control': 'no-store' } }
    )

    if (action === 'verify') {
      const session = getSession(sessionId(request))

      if (!session) throw new AppError(401, 'Your account session has expired.')

      response.cookies.set(sessionCookieName(), cookieValue(request, sessionCookieName()), {
        ...cookieOptions(),
        sameSite: 'lax',
        expires: new Date(session.expires),
      })
    }

    issueRequest(
      response,
      'sso',
      user,
      JSON.stringify({
        provider: id,
        state,
        verifier,
        nonce,
        action,
        session: action === 'verify' ? sessionId(request) : '',
        username: user?.username ?? '',
        fingerprint: user ? userFingerprint(user) : '',
      })
    )

    return response
  } catch (error) {
    return apiError(
      error instanceof AppError ? error : new AppError(503, 'SSO sign-in could not be started.')
    )
  }
}

import { type NextRequest, NextResponse } from 'next/server'

import { auditRequest } from '@/lib/audit'
import { auditAuth } from '@/lib/auth/audit'
import { clearRequest, issueRequest, readRequest } from '@/lib/auth/requests'
import { loginResponse } from '@/lib/auth/response'
import { linkUser, ssoProfile, ssoProviders } from '@/lib/auth/sso'
import { getAuthenticator } from '@/lib/auth/totp'
import { env } from '@/lib/config/env'
import { userFingerprint } from '@/lib/config/users'
import { getSession } from '@/lib/database/session'
import { transaction } from '@/lib/database/transaction'
import { AppError } from '@/lib/security/error'
import { providerName, ssoState } from '@/lib/validation/sso'

export const GET = auditRequest(
  async (request: NextRequest, context: { params: Promise<{ provider: string }> }) => {
    try {
      const id = providerName.parse((await context.params).provider)
      const provider = ssoProviders().find((entry) => entry.id === id)
      const pending = readRequest(request, 'sso', true)
      const state = ssoState.parse(JSON.parse(pending.value))

      if (!provider || state.provider !== id) throw new AppError(400, 'SSO verification expired.')

      const callback = new URL(`/api/auth/sso/${id}/callback`, env().APP_ORIGIN)

      callback.search = request.nextUrl.search

      const profile = await ssoProfile(provider, state, callback)
      const response = transaction(() => {
        const user = linkUser(id, profile)

        if (state.action === 'verify') {
          const session = getSession(state.session)

          if (
            !session ||
            session.username !== user.username ||
            state.username !== user.username ||
            state.fingerprint !== userFingerprint(user) ||
            session.fingerprint !== state.fingerprint
          ) {
            throw new AppError(403, 'SSO verification does not belong to this account session.')
          }

          const response = NextResponse.redirect(new URL('/account', env().APP_ORIGIN))

          issueRequest(response, 'sso-verify', user, '', state.session)

          return response
        }

        if (getAuthenticator(user)) {
          const response = NextResponse.redirect(new URL('/login?twoFactor=1', env().APP_ORIGIN))

          issueRequest(response, 'two-factor', user, `sso.${id}`)

          return response
        }

        const response = loginResponse(user, `sso.${id}`)

        response.headers.set('Location', env().APP_ORIGIN)

        return new NextResponse(null, { status: 303, headers: response.headers })
      })

      response.headers.set('Cache-Control', 'no-store')
      clearRequest(response, 'sso')

      return response
    } catch (error) {
      auditAuth(
        'anonymous',
        'login.sso.failed',
        error instanceof AppError ? error : new AppError(401, 'SSO verification failed.')
      )

      const response = NextResponse.redirect(new URL('/login?error=sso', env().APP_ORIGIN))

      response.headers.set('Cache-Control', 'no-store')
      clearRequest(response, 'sso')

      return response
    }
  }
)

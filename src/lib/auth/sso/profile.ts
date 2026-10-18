import 'server-only'

import * as client from 'openid-client'

import { ssoConfig } from '@/lib/auth/sso/config'
import { AppError } from '@/lib/security/error'
import { githubEmails, githubUser, verifiedEmail } from '@/lib/validation/sso'
import { type Provider, type SsoProfile, type SsoState } from '@/types/sso'

export async function ssoProfile(
  provider: Provider,
  state: SsoState,
  callback: URL
): Promise<SsoProfile> {
  const config = await ssoConfig(provider)
  const tokens = await client.authorizationCodeGrant(config, callback, {
    pkceCodeVerifier: state.verifier,
    expectedState: state.state,
    ...(provider.id !== 'github'
      ? {
          expectedNonce: state.nonce,
          idTokenExpected: true,
          ...(state.action === 'verify' ? { maxAge: 0 } : {}),
        }
      : {}),
  })

  if (provider.id === 'github') {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokens.access_token}`,
      'X-GitHub-Api-Version': '2026-03-10',
    }
    const user = await config[client.customFetch]!('https://api.github.com/user', {
      headers,
      method: 'GET',
      redirect: 'manual',
      body: undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const emails = await config[client.customFetch]!(
      'https://api.github.com/user/emails?per_page=100',
      {
        headers,
        method: 'GET',
        redirect: 'manual',
        body: undefined,
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (!user.ok || !emails.ok) throw new AppError(401, 'GitHub identity could not be verified.')

    const identity = githubUser.parse(await user.json())
    const email = githubEmails
      .parse(await emails.json())
      .find((entry) => entry.primary && entry.verified)

    if (!email) throw new AppError(403, 'SSO requires a verified primary email.')

    return { issuer: provider.issuer!, subject: String(identity.id), email: email.email }
  }

  const claims = tokens.claims()!
  let identity = verifiedEmail.safeParse(claims)

  if (!identity.success && config.serverMetadata().userinfo_endpoint) {
    identity = verifiedEmail.safeParse(
      await client.fetchUserInfo(config, tokens.access_token, claims.sub)
    )
  }

  if (!identity.success) throw new AppError(403, 'SSO requires a verified email address.')

  return {
    issuer: config.serverMetadata().issuer,
    subject: identity.data.sub,
    email: identity.data.email,
  }
}

import 'server-only'

import { env } from '@/lib/config/env'
import { providersSchema } from '@/lib/validation/sso'
import { type Provider } from '@/types/sso'

const names = {
  authentik: 'Authentik',
  github: 'GitHub',
  google: 'Google',
  zitadel: 'Zitadel',
  keycloak: 'Keycloak',
}

export function ssoProviders(): Provider[] {
  let value: unknown

  try {
    value = JSON.parse(env().SSO_PROVIDERS_JSON)
  } catch {
    throw new Error('SSO_PROVIDERS_JSON must contain valid JSON.')
  }

  const providers = providersSchema.parse(value)

  if (new Set(providers.map((provider) => provider.id)).size !== providers.length) {
    throw new Error('SSO provider IDs must be unique.')
  }

  for (const provider of providers) {
    provider.name ??= names[provider.id]

    const issuer =
      provider.id === 'github'
        ? 'https://github.com'
        : provider.id === 'google'
          ? 'https://accounts.google.com'
          : provider.issuer

    if (!issuer) throw new Error('Custom SSO providers require an issuer.')

    for (const value of [issuer, ...provider.origins]) {
      const url = new URL(value)

      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new Error('SSO endpoints require HTTPS without credentials or query parameters.')
      }
    }

    provider.issuer = issuer
  }

  return providers
}

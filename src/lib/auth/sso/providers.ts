import 'server-only'

import { env } from '@/lib/config/env'
import { providerSchema } from '@/lib/validation/sso'
import { type Provider } from '@/types/sso'

const entries = [
  ['authentik', 'AUTHENTIK', 'Authentik'],
  ['github', 'GITHUB', 'GitHub'],
  ['google', 'GOOGLE', 'Google'],
  ['zitadel', 'ZITADEL', 'Zitadel'],
  ['keycloak', 'KEYCLOAK', 'Keycloak'],
] as const

export function ssoProviders(config = env()): Provider[] {
  const providers: Provider[] = []

  for (const [id, prefix, name] of entries) {
    const clientId = config[`${prefix}_ID`]
    const clientSecret = config[`${prefix}_SECRET`]

    if (!clientId && !clientSecret) continue

    if (!clientId || !clientSecret.trim()) {
      throw new Error(`${prefix}_ID and ${prefix}_SECRET must both be set.`)
    }

    const issuer =
      prefix === 'GITHUB'
        ? 'https://github.com'
        : prefix === 'GOOGLE'
          ? 'https://accounts.google.com'
          : config[`${prefix}_ISSUER`]

    if (!issuer) throw new Error(`${prefix}_ISSUER is required when ${prefix} SSO is enabled.`)

    const result = providerSchema.safeParse({
      id,
      name: config[`${prefix}_NAME`] || name,
      issuer,
      clientId,
      clientSecret,
      origins: config[`${prefix}_ORIGINS`]
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      authMethod: config[`${prefix}_AUTH_METHOD`],
    })

    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ')

      throw new Error(`Invalid ${prefix} SSO configuration: ${fields}`)
    }

    providers.push(result.data)
  }

  return providers
}

import 'server-only'

import { createHash } from 'node:crypto'
import * as client from 'openid-client'

import { readBounded } from '@/lib/security/request'
import { type Provider } from '@/types/sso'

const configurations = new Map<string, { expires: number; value: client.Configuration }>()

export async function ssoConfig(provider: Provider): Promise<client.Configuration> {
  const key = createHash('sha256').update(JSON.stringify(provider)).digest('hex')
  const cached = configurations.get(key)

  if (cached && cached.expires > Date.now()) return cached.value

  const origins = new Set([
    new URL(provider.issuer!).origin,
    ...provider.origins.map((origin) => new URL(origin).origin),
    ...(provider.id === 'google'
      ? [
          'https://oauth2.googleapis.com',
          'https://www.googleapis.com',
          'https://openidconnect.googleapis.com',
        ]
      : provider.id === 'github'
        ? ['https://api.github.com']
        : []),
  ])

  const fetcher: client.CustomFetch = async (input, options) => {
    const url = new URL(String(input))

    if (url.protocol !== 'https:' || url.username || url.password || !origins.has(url.origin)) {
      throw new Error('SSO endpoint origin is not approved.')
    }

    const timeout = AbortSignal.timeout(10_000)
    const response = await fetch(input, {
      ...options,
      body:
        options?.body instanceof Uint8Array ? new Uint8Array(options.body).buffer : options?.body,
      redirect: 'manual',
      signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    })

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      throw new Error('SSO endpoint redirects are not permitted.')
    }

    return new Response(await readBounded(response, 512 * 1024), {
      status: response.status,
      headers: response.headers,
    })
  }

  const auth =
    provider.authMethod === 'basic'
      ? client.ClientSecretBasic(provider.clientSecret)
      : client.ClientSecretPost(provider.clientSecret)

  const config =
    provider.id === 'github'
      ? new client.Configuration(
          {
            issuer: 'https://github.com',
            authorization_endpoint: 'https://github.com/login/oauth/authorize',
            token_endpoint: 'https://github.com/login/oauth/access_token',
          },
          provider.clientId,
          provider.clientSecret,
          auth
        )
      : await client.discovery(
          new URL(provider.issuer!),
          provider.clientId,
          provider.clientSecret,
          auth,
          {
            [client.customFetch]: fetcher,
            execute: [client.enableNonRepudiationChecks],
            timeout: 10,
          }
        )

  config[client.customFetch] = fetcher
  config.timeout = 10

  for (const name of [
    'authorization_endpoint',
    'token_endpoint',
    'userinfo_endpoint',
    'jwks_uri',
  ]) {
    const endpoint = config.serverMetadata()[name]

    if (typeof endpoint !== 'string') continue

    const url = new URL(endpoint)

    if (
      url.protocol !== 'https:' ||
      !origins.has(url.origin) ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error('SSO discovery returned an unapproved endpoint.')
    }
  }

  if (configurations.size >= 5) configurations.clear()

  configurations.set(key, { value: config, expires: Date.now() + 5 * 60_000 })

  return config
}

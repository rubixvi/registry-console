import 'server-only'

import { validateBlobRedirect, validateToken, validateUrl } from '@/lib/registry/allowlist'
import { parseChallenge } from '@/lib/registry/challenge'
import {
  MANIFEST_ACCEPT,
  MAX_INFLIGHT,
  MAX_RESPONSE_BYTES,
  MAX_TOKEN_BYTES,
  REQUEST_TIMEOUT_MS,
} from '@/lib/registry/client/constants'
import { counter } from '@/lib/registry/client/state'
import { DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { checkBackoff, checkRegistry, limitRegistry, limitResponse } from '@/lib/registry/throttle'
import {
  cachedToken,
  forgetToken,
  loadToken,
  rememberToken,
  tokenKey,
} from '@/lib/registry/token-cache'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { readBounded } from '@/lib/security/request'
import { tokenSchema } from '@/lib/validation/response/registry'
import { type RegistryOptions, type RegistryRecord, type RegistryResponse } from '@/types/registry'

export async function fetchRegistry(
  registry: RegistryRecord,
  path: string,
  options: RegistryOptions = {}
): Promise<RegistryResponse> {
  if (counter.inflight >= MAX_INFLIGHT) {
    throw new AppError(503, 'Registry request capacity reached. Retry shortly.')
  }

  counter.inflight++

  try {
    const origin = validateUrl(registry.url, registry.provider)

    if (!path.startsWith('/v2/') || new URL(path, origin).origin !== origin) {
      throw new AppError(400, 'Invalid registry path.')
    }

    const url = origin + path
    const { method = 'GET', scope } = options

    checkRegistry(registry, path, method)

    const dockerHub = origin === DOCKER_HUB_REGISTRY
    const password = decryptSecret(registry.password)
    const key = tokenKey(registry, scope)
    const cached = cachedToken(key)
    const headers = new Headers({ Accept: MANIFEST_ACCEPT })

    let basicAuth: string | undefined

    if (registry.username || password) {
      const credentials = Buffer.from(`${registry.username}:${password}`).toString('base64')

      basicAuth = `Basic ${credentials}`
    }

    if (cached) {
      headers.set('Authorization', `Bearer ${cached}`)
    } else if (basicAuth) {
      headers.set('Authorization', basicAuth)
    }

    const init: RequestInit = {
      method,
      headers,
      redirect: 'manual',
      cache: 'no-store',
    }

    let response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (response.status === 401) {
      forgetToken(key, cached)

      const challengeHeader = response.headers.get('www-authenticate')

      await response.body?.cancel()

      const challenge = parseChallenge(challengeHeader)

      if (!challenge) {
        throw new AppError(502, 'Registry rejected its configured credentials.')
      }

      const tokenUrl = validateToken(challenge.realm, origin)
      const tokenHeaders = new Headers({ Accept: 'application/json' })

      if (challenge.service) {
        tokenUrl.searchParams.set('service', challenge.service)
      }

      if (scope) {
        tokenUrl.searchParams.set('scope', scope)
      } else {
        tokenUrl.searchParams.delete('scope')
      }

      if (basicAuth) {
        tokenHeaders.set('Authorization', basicAuth)
      }

      const token = await loadToken(key, async () => {
        checkBackoff(dockerHub ? tokenUrl.origin : origin)

        const tokenResp = await fetch(tokenUrl, {
          headers: tokenHeaders,
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (!tokenResp.ok) {
          await tokenResp.body?.cancel()

          if (tokenResp.status === 429) {
            throw limitRegistry(dockerHub ? tokenUrl.origin : origin, tokenResp.headers)
          }

          throw new AppError(502, 'Registry token authentication failed.')
        }

        const tokenBody = await readBounded(tokenResp, MAX_TOKEN_BYTES)

        let tokenData: unknown

        try {
          tokenData = JSON.parse(tokenBody)
        } catch {
          throw new AppError(502, 'Registry token response is invalid.')
        }

        const parsed = tokenSchema.safeParse(tokenData)

        if (!parsed.success) {
          throw new AppError(502, 'Registry token response is invalid.')
        }

        const value = parsed.data.token || parsed.data.access_token

        if (!value || /[\r\n]/.test(value)) {
          throw new AppError(502, 'Registry token response is invalid.')
        }

        rememberToken(key, value, parsed.data.expires_in ?? 60)

        return value
      })

      headers.set('Authorization', `Bearer ${token}`)

      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    }

    let responseOrigin = origin

    if (method === 'GET' && /^\/v2\/.+\/blobs\/sha256(?::|%3A)[a-f0-9]{64}$/i.test(path)) {
      for (let redirects = 0; [301, 302, 303, 307, 308].includes(response.status); redirects++) {
        const location = response.headers.get('location')

        await response.body?.cancel()

        if (!location || redirects >= 2) {
          throw new AppError(502, 'Registry blob redirect limit exceeded.')
        }

        const destination = validateBlobRedirect(location, origin)

        responseOrigin = destination.origin

        if (dockerHub) checkBackoff(responseOrigin)

        response = await fetch(destination, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      }
    }

    if (!response.ok) {
      const { status } = response

      if (status === 429) {
        if (dockerHub && responseOrigin !== origin) {
          await response.body?.cancel()
          throw limitRegistry(responseOrigin, response.headers)
        }

        throw await limitResponse(registry, path, method, response)
      }

      await response.body?.cancel()

      if (method === 'HEAD' && (status === 405 || status === 501)) {
        throw new AppError(405, 'Registry does not support manifest HEAD requests.')
      }

      if (status === 404) {
        throw new AppError(404, 'Registry resource was not found.')
      }

      if (method === 'DELETE' && (status === 400 || status === 405)) {
        throw new AppError(409, 'Manifest deletion is disabled or unsupported by this registry.')
      }

      if (status === 401 || status === 403) {
        if (dockerHub && method === 'DELETE') {
          throw new AppError(
            403,
            'Docker Hub denied deletion. Check delete access and remove any remaining tag or image references.'
          )
        }

        throw new AppError(502, 'Registry denied access. Check its credentials and permissions.')
      }

      if (status >= 300 && status < 400) {
        throw new AppError(
          502,
          'Registry redirects are blocked. Configure the final registry origin.'
        )
      }

      throw new AppError(502, 'Registry request failed. Check its status and configuration.')
    }

    if (method === 'HEAD') {
      await response.body?.cancel()
    }

    return {
      text: method === 'HEAD' ? '' : await readBounded(response, MAX_RESPONSE_BYTES),
      headers: response.headers,
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(
      502,
      'Unable to reach the registry securely. Check its URL, TLS certificate, and connection.'
    )
  } finally {
    counter.inflight--
  }
}

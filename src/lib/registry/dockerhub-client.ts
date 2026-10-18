import 'server-only'

import { validateUrl } from '@/lib/registry/allowlist'
import {
  cachedResponse,
  cacheGeneration,
  invalidateResponse,
  rememberResponse,
} from '@/lib/registry/cache'
import { DOCKER_HUB_API } from '@/lib/registry/dockerhub-settings'
import { shareResponse } from '@/lib/registry/requests'
import { checkBackoff, limitRegistry } from '@/lib/registry/throttle'
import { forgetToken, loadToken, rememberToken, tokenKey } from '@/lib/registry/token-cache'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { readBounded } from '@/lib/security/request'
import { authSchema } from '@/lib/validation/response/dockerhub'
import { type RegistryRecord, type RegistryResponse } from '@/types/registry'

let inflight = 0

async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  checkBackoff(DOCKER_HUB_API)

  const response = await fetch(`${DOCKER_HUB_API}${path}`, {
    ...init,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000),
  })

  if (response.status === 429) {
    await response.body?.cancel()
    throw limitRegistry(DOCKER_HUB_API, response.headers)
  }

  return response
}

async function hubToken(registry: RegistryRecord): Promise<string | null> {
  if (!registry.username && !registry.password) return null

  const key = tokenKey(registry, 'dockerhub-api')

  return loadToken(key, async () => {
    const response = await hubFetch('/v2/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        identifier: registry.username,
        secret: decryptSecret(registry.password),
      }),
    })

    if (!response.ok) {
      await response.body?.cancel()
      throw new AppError(502, 'Docker Hub authentication failed. Check its access token.')
    }

    const body = authSchema.parse(JSON.parse(await readBounded(response, 64 * 1024)))

    rememberToken(key, body.access_token, 60)

    return body.access_token
  })
}

export async function hubRequest(
  registry: RegistryRecord,
  path: string,
  refresh = false
): Promise<RegistryResponse> {
  validateUrl(DOCKER_HUB_API, registry.provider)

  if (
    !path.startsWith('/v2/namespaces/') ||
    new URL(path, DOCKER_HUB_API).origin !== DOCKER_HUB_API
  ) {
    throw new AppError(400, 'Invalid Docker Hub API path.')
  }

  const scope = 'dockerhub-api'

  if (refresh) invalidateResponse(registry, path, scope)

  const cached = !refresh && cachedResponse(registry, path, scope)

  if (cached) return cached

  const generation = cacheGeneration()
  const result = await shareResponse(registry, path, scope, async () => {
    if (inflight >= 4) {
      throw new AppError(503, 'Docker Hub request capacity reached. Retry shortly.')
    }

    inflight++

    try {
      const headers = new Headers({ Accept: 'application/json' })
      let token = await hubToken(registry)

      if (token) headers.set('Authorization', `Bearer ${token}`)

      let response = await hubFetch(path, { headers })

      if (response.status === 401 && token) {
        await response.body?.cancel()
        forgetToken(tokenKey(registry, scope), token)
        token = await hubToken(registry)
        headers.set('Authorization', `Bearer ${token}`)
        response = await hubFetch(path, { headers })
      }

      if (!response.ok) {
        await response.body?.cancel()

        if (response.status === 404) {
          throw new AppError(404, 'Docker Hub resource was not found.')
        }

        throw new AppError(
          502,
          'Docker Hub denied the request. Check the namespace and access token.'
        )
      }

      return { text: await readBounded(response, 2 * 1024 * 1024), headers: response.headers }
    } catch (error) {
      if (error instanceof AppError) throw error

      throw new AppError(502, 'Unable to read a valid Docker Hub response.')
    } finally {
      inflight--
    }
  })

  rememberResponse(registry, path, scope, result, generation)

  return result
}

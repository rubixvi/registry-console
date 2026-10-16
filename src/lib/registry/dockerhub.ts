import 'server-only'

import { z } from 'zod'

import { validateUrl } from '@/lib/registry/allowlist'
import { cachedResponse, cacheGeneration, rememberResponse } from '@/lib/registry/cache'
import { DOCKER_HUB_API, DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { checkBackoff, limitRegistry } from '@/lib/registry/throttle'
import { cachedToken, forgetToken, rememberToken, tokenKey } from '@/lib/registry/token-cache'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { readBounded } from '@/lib/security/request'
import { repositoryName } from '@/lib/validation/registry'
import { type RegistryPage, type RegistryPageInput, type RegistryRecord } from '@/types/registry'

const pageSchema = z.object({
  next: z.string().nullable(),
  results: z
    .array(
      z.object({
        name: z
          .string()
          .regex(/^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*$/)
          .max(255),
      })
    )
    .max(100),
})

const authSchema = z.object({
  access_token: z
    .string()
    .min(1)
    .max(32_768)
    .regex(/^[^\r\n]+$/),
})

let inflight = 0

function namespaceFor(registry: RegistryRecord): string {
  if (
    registry.provider !== 'dockerhub' ||
    registry.url !== DOCKER_HUB_REGISTRY ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(registry.namespace ?? '')
  ) {
    throw new AppError(400, 'Invalid Docker Hub connection settings.')
  }

  validateUrl(registry.url, registry.provider)
  validateUrl(DOCKER_HUB_API, registry.provider)

  return registry.namespace!
}

export function assertDockerHubRepository(registry: RegistryRecord, repository: string): void {
  if (registry.provider === 'dockerhub' && !repository.startsWith(`${namespaceFor(registry)}/`)) {
    throw new AppError(400, 'Repository is outside this Docker Hub namespace.')
  }
}

async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  checkBackoff(DOCKER_HUB_API)

  const response = await fetch(`${DOCKER_HUB_API}${path}`, {
    ...init,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000),
  })

  if (!response.ok) {
    await response.body?.cancel()

    if (response.status === 429) {
      throw limitRegistry(DOCKER_HUB_API, response.headers)
    }

    throw new AppError(502, 'Docker Hub denied the request. Check the namespace and access token.')
  }

  return response
}

async function hubToken(registry: RegistryRecord): Promise<string | null> {
  if (!registry.username && !registry.password) {
    return null
  }

  const key = tokenKey(registry, 'dockerhub-api')
  const current = cachedToken(key)

  if (current) {
    return current
  }

  const response = await hubFetch('/v2/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      identifier: registry.username,
      secret: decryptSecret(registry.password),
    }),
  })

  const body = authSchema.parse(JSON.parse(await readBounded(response, 64 * 1024)))

  rememberToken(key, body.access_token, 60)

  return body.access_token
}

export async function dockerHubPage(
  registry: RegistryRecord,
  input: RegistryPageInput,
  refresh = false
): Promise<RegistryPage> {
  const namespace = namespaceFor(registry)
  const page = input.last ? Number(input.last) : 1

  if (!Number.isInteger(page) || page < 1 || page > 200) {
    throw new AppError(400, 'Invalid Docker Hub page cursor.')
  }

  const path = `/v2/namespaces/${encodeURIComponent(namespace)}/repositories`
  const query = new URLSearchParams({ page: String(page), page_size: String(input.n) })
  const requestPath = `${path}?${query}`
  const scope = 'dockerhub-api'
  const cached = !refresh && cachedResponse(registry, requestPath, scope)
  const generation = cacheGeneration()

  if (inflight >= 4) {
    throw new AppError(503, 'Docker Hub request capacity reached. Retry shortly.')
  }

  inflight++

  try {
    let text: string
    let responseHeaders: Headers | undefined

    if (cached) {
      text = cached.text
    } else {
      const token = await hubToken(registry)
      const headers = new Headers({ Accept: 'application/json' })

      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }

      const response = await hubFetch(requestPath, { headers })

      text = await readBounded(response, 2 * 1024 * 1024)
      responseHeaders = response.headers
    }

    const body = pageSchema.parse(JSON.parse(text))

    if (body.results.length > input.n) {
      throw new AppError(502, 'Docker Hub ignored its requested page limit.')
    }

    let next: string | null = null

    if (body.next) {
      const url = new URL(body.next, DOCKER_HUB_API)

      if (
        url.origin !== DOCKER_HUB_API ||
        url.pathname.replace(/\/$/, '') !== path ||
        url.username ||
        url.password ||
        url.hash ||
        Number(url.searchParams.get('page')) !== page + 1
      ) {
        throw new AppError(502, 'Docker Hub returned an invalid pagination link.')
      }

      next = String(page + 1)
    }

    if (responseHeaders) {
      rememberResponse(registry, requestPath, scope, { text, headers: responseHeaders }, generation)
    }

    return {
      items: body.results.map((entry) => repositoryName.parse(`${namespace}/${entry.name}`)),
      next,
    }
  } catch (error) {
    forgetToken(tokenKey(registry, 'dockerhub-api'))

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(502, 'Unable to read a valid Docker Hub repository listing.')
  } finally {
    inflight--
  }
}

import 'server-only'

import { validateToken, validateUrl } from '@/lib/registry/allowlist'
import {
  cachedResponse,
  cacheGeneration,
  invalidateRegistry,
  invalidateResponse,
  rememberResponse,
} from '@/lib/registry/cache'
import { parseChallenge } from '@/lib/registry/challenge'
import { cachedToken, forgetToken, rememberToken, tokenKey } from '@/lib/registry/token-cache'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { readBounded } from '@/lib/security/request'
import { tokenSchema } from '@/lib/validation/response/registry'
import { type RegistryOptions, type RegistryRecord, type RegistryResponse } from '@/types/registry'

const MAX_INFLIGHT = 12
const REQUEST_TIMEOUT_MS = 12_000
const MAX_TOKEN_BYTES = 32 * 1024
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

let inflight = 0

export async function registryRequest(
  registry: RegistryRecord,
  path: string,
  options: RegistryOptions = {}
): Promise<RegistryResponse> {
  const origin = validateUrl(registry.url)

  if (!path.startsWith('/v2/') || new URL(path, origin).origin !== origin) {
    throw new AppError(400, 'Invalid registry path.')
  }

  const deletion = options.method === 'DELETE'

  if (deletion) invalidateRegistry(registry.id)
  else if (options.cache === 'reload') invalidateResponse(registry, path, options.scope)

  try {
    if (!deletion && options.cache !== 'reload') {
      const cached = cachedResponse(registry, path, options.scope)

      if (cached) return cached
    }

    const generation = cacheGeneration()
    const response = await fetchRegistry(registry, path, options)

    if (!deletion) rememberResponse(registry, path, options.scope, response, generation)

    return response
  } finally {
    if (deletion) invalidateRegistry(registry.id)
  }
}

async function fetchRegistry(
  registry: RegistryRecord,
  path: string,
  options: RegistryOptions = {}
): Promise<RegistryResponse> {
  if (inflight >= MAX_INFLIGHT) {
    throw new AppError(503, 'Registry request capacity reached. Retry shortly.')
  }

  inflight++

  try {
    const origin = validateUrl(registry.url)

    if (!path.startsWith('/v2/') || new URL(path, origin).origin !== origin) {
      throw new AppError(400, 'Invalid registry path.')
    }

    const url = origin + path
    const { method = 'GET', scope } = options
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
      forgetToken(key)

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

      const tokenResp = await fetch(tokenUrl, {
        headers: tokenHeaders,
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!tokenResp.ok) {
        await tokenResp.body?.cancel()
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

      const token = parsed.data.token || parsed.data.access_token

      if (!token || /[\r\n]/.test(token)) {
        throw new AppError(502, 'Registry token response is invalid.')
      }

      rememberToken(key, token, parsed.data.expires_in ?? 60)
      headers.set('Authorization', `Bearer ${token}`)

      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    }

    if (!response.ok) {
      await response.body?.cancel()

      const { status } = response

      if (status === 404) {
        throw new AppError(404, 'Registry resource was not found.')
      }

      if (method === 'DELETE' && (status === 400 || status === 405)) {
        throw new AppError(409, 'Manifest deletion is disabled or unsupported by this registry.')
      }

      if (status === 401 || status === 403) {
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

    return {
      text: await readBounded(response, MAX_RESPONSE_BYTES),
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
    inflight--
  }
}

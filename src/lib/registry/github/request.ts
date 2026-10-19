import 'server-only'

import {
  cachedResponse,
  cacheGeneration,
  invalidateRegistry,
  invalidateResponse,
  rememberResponse,
} from '@/lib/registry/cache'
import { enter } from '@/lib/registry/client/state'
import { GITHUB_API, GITHUB_REGISTRY } from '@/lib/registry/github/constants'
import { githubFetch } from '@/lib/registry/github/fetch'
import { shareResponse } from '@/lib/registry/requests'
import { hasLimits } from '@/lib/security/context'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord, type RegistryResponse } from '@/types/registry'

export async function githubRequest(
  registry: RegistryRecord,
  path: string,
  refresh = false,
  method: 'GET' | 'DELETE' = 'GET'
): Promise<RegistryResponse> {
  const url = new URL(path, GITHUB_API)
  const namespace = registry.namespace ?? ''
  const owner = `/users/${encodeURIComponent(namespace)}`
  const paths = [
    '/user',
    `${owner}`,
    '/user/packages',
    `${owner}/packages`,
    `/orgs/${encodeURIComponent(namespace)}/packages`,
  ]
  const allowed = paths.some(
    (prefix) =>
      url.pathname === prefix ||
      (prefix.endsWith('/packages') && url.pathname.startsWith(`${prefix}/container/`))
  )

  if (
    registry.provider !== 'github' ||
    registry.url !== GITHUB_REGISTRY ||
    !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(namespace) ||
    url.origin !== GITHUB_API ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    url.username ||
    url.password ||
    url.hash ||
    !allowed ||
    (method === 'DELETE' &&
      (!/\/packages\/container\/[^/]+\/versions\/[1-9][0-9]*$/.test(url.pathname) ||
        registry.readOnly))
  ) {
    throw new AppError(400, 'Invalid GitHub package request.')
  }

  const scope = 'github-api'

  if (method === 'DELETE') invalidateRegistry(registry.id)
  else if (refresh) invalidateResponse(registry, path, scope)

  const cached = method === 'GET' && !refresh && cachedResponse(registry, path, scope)

  if (cached) return cached

  const generation = cacheGeneration()
  const load = async () => {
    const release = await enter(!hasLimits())

    try {
      return await githubFetch(registry, path, method)
    } catch (error) {
      if (error instanceof AppError) throw error

      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
        throw new AppError(504, 'GitHub request timed out. Retry shortly.', 1)
      }

      throw new AppError(502, 'Unable to read a valid GitHub response.')
    } finally {
      release()
    }
  }

  try {
    const result =
      method === 'GET' ? await shareResponse(registry, path, scope, load) : await load()

    if (method === 'GET') rememberResponse(registry, path, scope, result, generation)

    return result
  } finally {
    if (method === 'DELETE') invalidateRegistry(registry.id)
  }
}

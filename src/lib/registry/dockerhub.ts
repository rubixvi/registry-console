import 'server-only'

import { validateUrl } from '@/lib/registry/allowlist'
import {
  cachedResponse,
  cacheGeneration,
  invalidateResponse,
  rememberResponse,
} from '@/lib/registry/cache'
import { DOCKER_HUB_API, DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { hubRequest } from '@/lib/registry/dockerhub-client'
import { AppError } from '@/lib/security/error'
import { repositoryName } from '@/lib/validation/registry'
import { pageSchema, tagPageSchema } from '@/lib/validation/response/dockerhub'
import { type RegistryPage, type RegistryPageInput, type RegistryRecord } from '@/types/registry'

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

export function hubTags(registry: RegistryRecord, repository: string): string {
  repositoryName.parse(repository)
  assertDockerHubRepository(registry, repository)

  const namespace = namespaceFor(registry)
  const name = repository.slice(namespace.length + 1)

  if (!name || name.includes('/')) {
    throw new AppError(400, 'Invalid Docker Hub repository.')
  }

  return `/v2/namespaces/${encodeURIComponent(namespace)}/repositories/${encodeURIComponent(name)}/tags`
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

  const path = input.repository
    ? hubTags(registry, input.repository)
    : `/v2/namespaces/${encodeURIComponent(namespace)}/repositories`
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(input.n),
  })
  const requestPath = `${path}?${query}`

  if (refresh) invalidateResponse(registry, requestPath, 'dockerhub-api')

  const generation = cacheGeneration()
  const cached = cachedResponse(registry, requestPath, 'dockerhub-api')

  try {
    const result = await hubRequest(registry, requestPath)
    const body = input.repository
      ? tagPageSchema.parse(JSON.parse(result.text))
      : pageSchema.parse(JSON.parse(result.text))

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

    if (input.repository && !cached) {
      for (const entry of body.results) {
        rememberResponse(
          registry,
          `${path}/${encodeURIComponent(entry.name)}`,
          'dockerhub-api',
          { text: JSON.stringify(entry), headers: result.headers },
          generation
        )
      }
    }

    return {
      items: body.results.map((entry) =>
        input.repository ? entry.name : repositoryName.parse(`${namespace}/${entry.name}`)
      ),
      next,
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(502, 'Unable to read a valid Docker Hub listing.')
  }
}

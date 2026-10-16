import 'server-only'

import { registryRequest } from '@/lib/registry/client'
import { assertDockerHubRepository, dockerHubPage } from '@/lib/registry/dockerhub'
import { nextCursor } from '@/lib/registry/pagination'
import { AppError } from '@/lib/security/error'
import { catalogueSchema, tagsSchema } from '@/lib/validation/response/registry'
import { type RegistryPage, type RegistryPageInput, type RegistryRecord } from '@/types/registry'

export async function registryPage(
  registry: RegistryRecord,
  input: RegistryPageInput,
  refresh = false
): Promise<RegistryPage> {
  const { repository, last, n } = input

  if (registry.provider === 'dockerhub' && !repository) {
    return dockerHubPage(registry, input, refresh)
  }

  if (repository) {
    assertDockerHubRepository(registry, repository)
  }

  let path = '/v2/_catalog'
  let scope = 'registry:catalog:*'

  if (repository) {
    const encodedRepository = repository.split('/').map(encodeURIComponent).join('/')

    path = `/v2/${encodedRepository}/tags/list`
    scope = `repository:${repository}:pull`
  }

  const query = new URLSearchParams({ n: String(n) })

  if (last) {
    query.set('last', last)
  }

  const result = await registryRequest(registry, `${path}?${query}`, {
    scope,
    cache: refresh ? 'reload' : 'default',
  })

  try {
    const body: unknown = JSON.parse(result.text)
    let items: string[]

    if (repository) {
      items = tagsSchema.parse(body).tags ?? []
    } else {
      items = catalogueSchema.parse(body).repositories
    }

    if (items.length > n) {
      throw new AppError(
        502,
        'Registry ignored pagination. Configure a compatible registry page limit.'
      )
    }

    return {
      items,
      next: nextCursor(result.headers.get('link'), registry.url, path),
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(502, 'Registry returned an invalid catalogue or tag response.')
  }
}

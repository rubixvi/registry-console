import 'server-only'

import { githubCursor } from '@/lib/registry/github/cursor'
import { githubOwnerPath } from '@/lib/registry/github/owner'
import { githubRequest } from '@/lib/registry/github/request'
import { AppError } from '@/lib/security/error'
import { repositoryName } from '@/lib/validation/registry'
import { githubPackages } from '@/lib/validation/response/github'
import { type RegistryPage, type RegistryPageInput, type RegistryRecord } from '@/types/registry'

export async function githubPage(
  registry: RegistryRecord,
  input: RegistryPageInput,
  refresh = false
): Promise<RegistryPage> {
  const page = input.last ? Number(input.last) : 1

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page * input.n > 10_000 ||
    input.n < 1 ||
    input.n > 100
  ) {
    throw new AppError(400, 'Invalid GitHub package page cursor.')
  }

  try {
    const path = await githubOwnerPath(registry, refresh)
    const query = new URLSearchParams({
      package_type: 'container',
      per_page: String(input.n),
      page: String(page),
    })
    const response = await githubRequest(registry, `${path}?${query}`, refresh)
    const packages = githubPackages.parse(JSON.parse(response.text))

    if (
      packages.length > input.n ||
      packages.some((item) => item.owner.login.toLowerCase() !== registry.namespace)
    ) {
      throw new AppError(
        502,
        'GitHub returned packages outside the requested namespace or page limit.'
      )
    }

    return {
      items: packages.map((item) => repositoryName.parse(`${registry.namespace}/${item.name}`)),
      next: githubCursor(response.headers.get('link'), path, page, input.n),
    }
  } catch (error) {
    if (error instanceof AppError) throw error

    throw new AppError(502, 'GitHub returned an invalid package listing.')
  }
}

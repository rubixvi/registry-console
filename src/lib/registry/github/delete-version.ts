import 'server-only'

import { githubCursor } from '@/lib/registry/github/cursor'
import { githubOwnerPath } from '@/lib/registry/github/owner'
import { githubRequest } from '@/lib/registry/github/request'
import { assertRepository } from '@/lib/registry/repository'
import { AppError } from '@/lib/security/error'
import { digestName, repositoryName } from '@/lib/validation/registry'
import { githubVersions } from '@/lib/validation/response/github'
import { type RegistryRecord } from '@/types/registry'

export async function deleteVersion(
  registry: RegistryRecord,
  repository: string,
  digest: string
): Promise<void> {
  if (registry.readOnly) throw new AppError(403, 'This connection is read only.')

  repositoryName.parse(repository)
  digestName.parse(digest)
  assertRepository(registry, repository)

  try {
    const owner = await githubOwnerPath(registry, true)
    const name = repository.slice(registry.namespace!.length + 1)
    const path = `${owner}/container/${encodeURIComponent(name)}/versions`
    const deadline = Date.now() + 60_000

    for (let page = 1; page <= 100; page++) {
      if (Date.now() >= deadline)
        throw new AppError(504, 'GitHub package version lookup timed out.')

      const response = await githubRequest(
        registry,
        `${path}?per_page=100&page=${page}&state=active`,
        true
      )
      const versions = githubVersions.parse(JSON.parse(response.text))
      const match = versions.find((version) => version.name === digest)

      if (match) {
        await githubRequest(registry, `${path}/${match.id}`, true, 'DELETE')
        return
      }

      if (!githubCursor(response.headers.get('link'), path, page, 100)) {
        throw new AppError(
          404,
          'The image digest was not found among the active GitHub package versions.'
        )
      }
    }

    throw new AppError(413, 'GitHub package version lookup exceeded 10,000 versions.')
  } catch (error) {
    if (error instanceof AppError) throw error

    throw new AppError(502, 'GitHub returned an invalid package version response.')
  }
}

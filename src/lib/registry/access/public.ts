import 'server-only'

import { fetchRegistry } from '@/lib/registry/client/fetch-registry'
import { hubPrivacy } from '@/lib/registry/dockerhub'
import { githubOwnerPath } from '@/lib/registry/github/owner'
import { githubRequest } from '@/lib/registry/github/request'
import { assertRepository } from '@/lib/registry/repository'
import { cachedToken, forgetToken, tokenKey } from '@/lib/registry/token-cache'
import { repositoryName } from '@/lib/validation/registry'
import { githubPackage } from '@/lib/validation/response/github'
import { tagsSchema } from '@/lib/validation/response/registry'
import { type RegistryRecord } from '@/types/registry'

export async function publicRep(registry: RegistryRecord, repository: string): Promise<boolean> {
  try {
    repositoryName.parse(repository)
    assertRepository(registry, repository)

    if (registry.provider === 'dockerhub' || registry.url === 'https://registry-1.docker.io') {
      return (await hubPrivacy(registry, repository, true)) === false
    }

    if (registry.provider === 'github') {
      const owner = await githubOwnerPath(registry)
      const name = repository.slice(registry.namespace!.length + 1)
      const response = await githubRequest(
        registry,
        `${owner}/container/${encodeURIComponent(name)}`,
        true
      )
      const parsed = githubPackage.parse(JSON.parse(response.text))

      return (
        parsed.visibility === 'public' &&
        parsed.name === name &&
        parsed.owner.login.toLowerCase() === registry.namespace
      )
    }

    const anonymous = {
      ...registry,
      id: `${registry.id}:public`,
      revision: `${registry.revision ?? ''}:public`,
      username: '',
      password: '',
    }
    const path = `/v2/${repository.split('/').map(encodeURIComponent).join('/')}/tags/list?n=1`
    const scope = `repository:${repository}:pull`
    const key = tokenKey(anonymous, scope)

    forgetToken(key, cachedToken(key))

    const result = await fetchRegistry(anonymous, path, { scope })
    const body: unknown = JSON.parse(result.text)

    return (
      tagsSchema.safeParse(body).success &&
      typeof body === 'object' &&
      body !== null &&
      'name' in body &&
      body.name === repository
    )
  } catch {
    return false
  }
}

import 'server-only'

import { githubRequest } from '@/lib/registry/github/request'
import { AppError } from '@/lib/security/error'
import { githubOwner } from '@/lib/validation/response/github'
import { type RegistryRecord } from '@/types/registry'

export async function githubOwnerPath(registry: RegistryRecord, refresh = false): Promise<string> {
  const namespace = registry.namespace!
  const response = await githubRequest(registry, `/users/${encodeURIComponent(namespace)}`, refresh)
  const result = githubOwner.safeParse(JSON.parse(response.text))

  if (!result.success || result.data.login.toLowerCase() !== namespace) {
    throw new AppError(502, 'GitHub returned an invalid namespace.')
  }

  if (result.data.type === 'Organization') return `/orgs/${encodeURIComponent(namespace)}/packages`

  const responseUser = await githubRequest(registry, '/user', refresh)
  const user = githubOwner.safeParse(JSON.parse(responseUser.text))

  if (!user.success || user.data.type !== 'User') {
    throw new AppError(502, 'GitHub returned an invalid token identity.')
  }

  return user.data.login.toLowerCase() === namespace
    ? '/user/packages'
    : `/users/${encodeURIComponent(namespace)}/packages`
}

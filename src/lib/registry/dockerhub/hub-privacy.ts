import 'server-only'

import { hubPath } from '@/lib/registry/dockerhub/hub-path'
import { hubRequest } from '@/lib/registry/dockerhub-client'
import { DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { repositorySchema } from '@/lib/validation/response/dockerhub'
import { type RegistryRecord } from '@/types/registry'

export async function hubPrivacy(
  registry: RegistryRecord,
  repository: string,
  refresh = false
): Promise<boolean | null> {
  if (registry.url !== DOCKER_HUB_REGISTRY && registry.provider !== 'dockerhub') return false

  const connection =
    registry.provider === 'dockerhub'
      ? registry
      : { ...registry, provider: 'dockerhub' as const, namespace: repository.split('/')[0] }
  const path = hubPath(connection, repository)

  try {
    const result = await hubRequest(connection, path, refresh)
    const body = repositorySchema.parse(JSON.parse(result.text))

    if (
      `${connection.namespace}/${body.name}` !== repository ||
      (body.namespace !== undefined && body.namespace !== connection.namespace)
    ) {
      return null
    }

    return body.is_private ?? null
  } catch {
    return null
  }
}

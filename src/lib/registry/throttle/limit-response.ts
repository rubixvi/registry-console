import 'server-only'

import { DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings'
import { limitRegistry } from '@/lib/registry/throttle/limit-registry'
import { pullScope } from '@/lib/registry/throttle/pull-scope'
import { type AppError } from '@/lib/security/error'
import { readBounded } from '@/lib/security/request'
import { type RegistryRecord } from '@/types/registry'

export async function limitResponse(
  registry: RegistryRecord,
  path: string,
  method: string,
  response: Response
): Promise<AppError> {
  const origin = new URL(registry.url).origin
  let scope = ''

  if (origin === DOCKER_HUB_REGISTRY && method === 'GET' && path.includes('/manifests/')) {
    let body = ''

    try {
      body = await readBounded(response, 16 * 1024, 2000)
    } catch {
      body = ''
    }

    if (
      /^0(?:;|$)/.test(response.headers.get('ratelimit-remaining')?.trim() ?? '') ||
      /pull rate limit|increase-rate-limits/i.test(body)
    ) {
      scope = pullScope(registry)
    }
  } else {
    await response.body?.cancel()
  }

  return limitRegistry(origin, response.headers, scope)
}

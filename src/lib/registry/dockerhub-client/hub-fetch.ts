import 'server-only'

import { DOCKER_HUB_API } from '@/lib/registry/dockerhub-settings'
import { checkBackoff, limitRegistry } from '@/lib/registry/throttle'

export async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  checkBackoff(DOCKER_HUB_API)

  const response = await fetch(`${DOCKER_HUB_API}${path}`, {
    ...init,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000),
  })

  if (response.status === 429) {
    await response.body?.cancel()
    throw limitRegistry(DOCKER_HUB_API, response.headers)
  }

  return response
}

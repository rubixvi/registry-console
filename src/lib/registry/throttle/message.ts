import 'server-only'

import {
  DOCKER_HUB_API,
  DOCKER_HUB_AUTH,
  DOCKER_HUB_BLOBS,
  DOCKER_HUB_REGISTRY,
} from '@/lib/registry/dockerhub-settings'
import { GITHUB_API, GITHUB_BLOBS, GITHUB_REGISTRY } from '@/lib/registry/github/constants'

export function message(origin: string, scope: string, paused = false): string {
  if (scope) {
    return paused
      ? 'Docker Hub pull quota reached. Manifest requests are paused locally.'
      : 'Docker Hub pull quota reached. Docker Hub returned HTTP 429.'
  }

  const service =
    origin === DOCKER_HUB_REGISTRY
      ? 'Docker Hub'
      : origin === DOCKER_HUB_API
        ? 'Docker Hub API'
        : origin === DOCKER_HUB_AUTH
          ? 'Docker Hub authentication'
          : DOCKER_HUB_BLOBS.has(origin)
            ? 'Docker Hub image storage'
            : origin === GITHUB_API
              ? 'GitHub API'
              : origin === GITHUB_REGISTRY
                ? 'GitHub'
                : origin === GITHUB_BLOBS
                  ? 'GitHub image storage'
                  : 'Upstream registry'

  return paused
    ? `${service} requests are paused locally after an upstream rate limit.`
    : `${service} returned HTTP 429. Its rate limit rejected this request.`
}

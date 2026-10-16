import 'server-only'

import { AppError } from '@/lib/security/error'
import { type RegistryInput, type RegistryProvider } from '@/types/registry'

export const DOCKER_HUB_REGISTRY = 'https://registry-1.docker.io'
export const DOCKER_HUB_API = 'https://hub.docker.com'
export const DOCKER_HUB_AUTH = 'https://auth.docker.io'

export const DOCKER_HUB_BLOBS = new Set([
  'https://production.cloudfront.docker.com',
  'https://production.cloudflare.docker.com',
  'https://docker-images-prod.6aa30f8b08e16409b46e0173d6de2f56.r2.cloudflarestorage.com',
])

export function dockerHubSettings(
  input: RegistryInput,
  origin: string
): { provider: RegistryProvider; namespace: string } {
  const provider = input.provider ?? 'distribution'
  const namespace = input.namespace?.trim() ?? ''

  if (provider === 'dockerhub') {
    if (origin !== DOCKER_HUB_REGISTRY) {
      throw new AppError(400, 'Docker Hub connections must use https://registry-1.docker.io.')
    }

    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(namespace)) {
      throw new AppError(400, 'Enter a Docker Hub user or organisation namespace.')
    }

    if (Boolean(input.username) !== Boolean(input.password)) {
      throw new AppError(400, 'Provide both a Docker Hub username and access token, or neither.')
    }
  } else if (namespace) {
    throw new AppError(400, 'Namespaces are configured only for Docker Hub connections.')
  }

  return { provider, namespace }
}

import 'server-only'

import { DOCKER_HUB_REGISTRY } from '@/lib/registry/dockerhub-settings/constants'
import { AppError } from '@/lib/security/error'
import { type RegistryInput, type RegistryProvider } from '@/types/registry'

export function hubSettings(
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

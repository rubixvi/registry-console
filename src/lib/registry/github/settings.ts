import 'server-only'

import { GITHUB_REGISTRY } from '@/lib/registry/github/constants'
import { AppError } from '@/lib/security/error'
import { type RegistryInput } from '@/types/registry'

export function githubSettings(input: RegistryInput, origin: string) {
  const namespace = input.namespace?.trim().toLowerCase() ?? ''

  if (origin !== GITHUB_REGISTRY) {
    throw new AppError(400, 'GitHub connections must use https://ghcr.io.')
  }

  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(namespace)) {
    throw new AppError(400, 'Enter a GitHub user or organisation namespace.')
  }

  if (!input.username || !input.password || /\s/.test(input.password)) {
    throw new AppError(400, 'Provide a GitHub username and personal access token for packages.')
  }

  return { provider: 'github' as const, namespace }
}

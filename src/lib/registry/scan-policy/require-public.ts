import 'server-only'

import { hubPrivacy } from '@/lib/registry/dockerhub'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'

export async function requirePublic(registry: RegistryRecord, repository: string): Promise<void> {
  const privacy = await hubPrivacy(registry, repository, true)

  if (privacy === true) {
    throw new AppError(
      403,
      'Private Docker Hub repositories are excluded from vulnerability scanning.'
    )
  }

  if (privacy === null) {
    throw new AppError(
      503,
      'Scanning is unavailable until Docker Hub confirms this repository is public.'
    )
  }
}

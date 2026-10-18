import 'server-only'

import { imageDetails } from '@/lib/registry/image'
import { MAX_INSPECTIONS } from '@/lib/registry/search/constants'
import { AppError } from '@/lib/security/error'
import { type RegistrySearch } from '@/types/registry-work'

export async function matchesArchitecture(
  search: RegistrySearch,
  repo: string,
  tag: string
): Promise<boolean> {
  if (Date.now() >= search.deadline) {
    throw new AppError(504, 'Architecture search timed out. Narrow the repository search.')
  }

  if (++search.inspected > MAX_INSPECTIONS) {
    throw new AppError(
      413,
      'Architecture search is limited to 200 images. Narrow the search or open one repository.'
    )
  }

  const details = await imageDetails(search.registry, repo, tag, search.refresh)

  if (search.dates && !search.dates.has(tag)) search.dates.set(tag, details.created)

  return details.platforms.some((platform) => platform.split('/')[1] === search.architecture)
}

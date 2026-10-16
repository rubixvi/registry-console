import 'server-only'

import { imageDetails } from '@/lib/registry/image'
import { registryListing } from '@/lib/registry/listing'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'

const MAX_INSPECTIONS = 200
const MAX_DURATION = 45_000

let active = 0

export async function searchRegistry(
  registry: RegistryRecord,
  options: { repository?: string; query?: string; architecture?: string },
  refresh = false
): Promise<{ items: string[] }> {
  if (active >= 2) {
    throw new AppError(503, 'Architecture search capacity reached. Retry shortly.')
  }

  active++

  try {
    const { repository, architecture } = options
    const query = options.query?.toLowerCase() ?? ''
    const listing = await registryListing(registry, repository, refresh)
    const matches = listing.items.filter((item) => item.toLowerCase().includes(query))

    if (!architecture) {
      return { items: matches }
    }

    const items: string[] = []
    const deadline = Date.now() + MAX_DURATION
    let inspected = 0

    async function matchesArchitecture(repo: string, tag: string): Promise<boolean> {
      if (Date.now() >= deadline) {
        throw new AppError(504, 'Architecture search timed out. Narrow the repository search.')
      }

      if (++inspected > MAX_INSPECTIONS) {
        throw new AppError(
          413,
          'Architecture search is limited to 200 images. Narrow the search or open one repository.'
        )
      }

      const details = await imageDetails(registry, repo, tag, refresh)

      return details.platforms.some((platform) => platform.split('/')[1] === architecture)
    }

    for (const item of matches) {
      if (repository) {
        if (await matchesArchitecture(repository, item)) {
          items.push(item)
        }

        continue
      }

      const tags = await registryListing(registry, item, refresh)

      for (const tag of tags.items) {
        if (await matchesArchitecture(item, tag)) {
          items.push(item)
          break
        }
      }
    }

    return { items }
  } finally {
    active--
  }
}

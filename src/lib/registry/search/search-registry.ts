import 'server-only'

import { registryListing } from '@/lib/registry/listing'
import { MAX_DURATION } from '@/lib/registry/search/constants'
import { matchesArchitecture } from '@/lib/registry/search/matches-architecture'
import { counter } from '@/lib/registry/search/state'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'

export async function searchRegistry(
  registry: RegistryRecord,
  options: { repository?: string; query?: string; architecture?: string },
  refresh = false
): Promise<{ items: string[] }> {
  if (counter.active >= 2) {
    throw new AppError(503, 'Architecture search capacity reached. Retry shortly.')
  }

  counter.active++

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
    const search = { registry, architecture, refresh, deadline, inspected: 0 }

    for (const item of matches) {
      if (repository) {
        if (await matchesArchitecture(search, repository, item)) {
          items.push(item)
        }

        continue
      }

      const tags = await registryListing(registry, item, refresh)

      for (const tag of tags.items) {
        if (await matchesArchitecture(search, item, tag)) {
          items.push(item)
          break
        }
      }
    }

    return { items }
  } finally {
    counter.active--
  }
}

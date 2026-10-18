import 'server-only'

import { registryListing } from '@/lib/registry/listing'
import { MAX_DURATION } from '@/lib/registry/search/constants'
import { matchesArchitecture } from '@/lib/registry/search/matches-architecture'
import { orderTags } from '@/lib/registry/search/order-tags'
import { enter } from '@/lib/registry/search/state'
import { hasLimits } from '@/lib/security/context'
import { type RegistryRecord } from '@/types/registry'
import { type TagOrder } from '@/utils/tag-order'

export async function searchRegistry(
  registry: RegistryRecord,
  options: { repository?: string; query?: string; architecture?: string; order?: TagOrder },
  refresh = false
): Promise<{ items: string[] }> {
  const release = await enter(!hasLimits())

  try {
    const { repository, architecture, order } = options
    const query = options.query?.toLowerCase() ?? ''
    const withDates = Boolean(repository && order?.startsWith('date-'))
    const listing = await registryListing(registry, repository, refresh, withDates)
    const matches = listing.items.filter((item) => item.toLowerCase().includes(query))
    const dates = new Map(Object.entries(listing.dates ?? {}))
    let items = matches

    if (architecture) {
      items = []

      const deadline = Date.now() + MAX_DURATION
      const search = {
        registry,
        architecture,
        refresh,
        deadline,
        inspected: 0,
        dates: withDates ? dates : undefined,
      }

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
    }

    if (repository && order) {
      items = await orderTags(
        registry,
        repository,
        { items, dates: Object.fromEntries(dates) },
        order,
        refresh
      )
    }

    return { items }
  } finally {
    release()
  }
}

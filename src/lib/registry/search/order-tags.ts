import 'server-only'

import { imageDetails } from '@/lib/registry/image'
import { MAX_DURATION } from '@/lib/registry/search/constants'
import { AppError } from '@/lib/security/error'
import { type RegistryListing, type RegistryRecord } from '@/types/registry'
import { sortTags, type TagOrder } from '@/utils/sort-tags'

export async function orderTags(
  registry: RegistryRecord,
  repository: string,
  listing: RegistryListing,
  order: TagOrder,
  refresh = false
): Promise<string[]> {
  const dates = new Map(Object.entries(listing.dates ?? {}))

  if (order.startsWith('date-')) {
    const pending = listing.items.filter((tag) => !dates.has(tag))
    const deadline = Date.now() + MAX_DURATION

    for (let index = 0; index < pending.length; index += 2) {
      if (Date.now() >= deadline) {
        throw new AppError(504, 'Date sorting timed out. Filter tags or choose a name order.')
      }

      const tags = pending.slice(index, index + 2)
      const results = await Promise.allSettled(
        tags.map((tag) => imageDetails(registry, repository, tag, refresh))
      )

      for (const [offset, result] of results.entries()) {
        if (result.status === 'rejected') throw result.reason

        dates.set(tags[offset], result.value.created)
      }
    }
  }

  return sortTags(listing.items, order, dates)
}

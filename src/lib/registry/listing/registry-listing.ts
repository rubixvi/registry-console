import 'server-only'

import { invalidateRegistry } from '@/lib/registry/cache'
import { registryPage } from '@/lib/registry/catalog'
import { MAX_DURATION, MAX_ITEMS, MAX_PAGES } from '@/lib/registry/listing/constants'
import { AppError } from '@/lib/security/error'
import { type RegistryListing, type RegistryRecord } from '@/types/registry'

export async function registryListing(
  registry: RegistryRecord,
  repository?: string,
  refresh = false,
  withDates = false
): Promise<RegistryListing> {
  if (refresh) invalidateRegistry(registry.id)

  const items = new Set<string>()
  const dates = new Map<string, string | null>()
  const cursors = new Set<string>()
  const deadline = Date.now() + MAX_DURATION
  let last = ''

  for (let index = 0; index < MAX_PAGES; index++) {
    if (Date.now() >= deadline) {
      throw new AppError(504, 'Listing timed out. Refresh to try again.')
    }

    const page = await registryPage(
      registry,
      { repository, last, n: 100, dates: withDates },
      refresh
    )

    for (const item of page.items) items.add(item)
    for (const [tag, date] of Object.entries(page.dates ?? {})) dates.set(tag, date)

    if (items.size > MAX_ITEMS) {
      throw new AppError(413, 'Browsing supports up to 10,000 repositories or tags per listing.')
    }

    if (!page.next) {
      return {
        items: [...items],
        ...(withDates ? { dates: Object.fromEntries(dates) } : {}),
      }
    }

    if (page.next === last || cursors.has(page.next)) {
      throw new AppError(502, 'Registry returned a repeated pagination cursor.')
    }

    cursors.add(page.next)
    last = page.next
  }

  throw new AppError(502, 'Registry exceeded the supported listing page limit.')
}

import 'server-only'

import { invalidateRegistry } from '@/lib/registry/cache'
import { registryPage } from '@/lib/registry/catalog'
import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'

const MAX_ITEMS = 10_000
const MAX_PAGES = 200
const MAX_DURATION = 60_000

export async function registryListing(
  registry: RegistryRecord,
  repository?: string,
  refresh = false
): Promise<{ items: string[] }> {
  if (refresh) invalidateRegistry(registry.id)

  const items = new Set<string>()
  const cursors = new Set<string>()
  const deadline = Date.now() + MAX_DURATION
  let last = ''

  for (let index = 0; index < MAX_PAGES; index++) {
    if (Date.now() >= deadline) {
      throw new AppError(504, 'Listing timed out. Refresh to try again.')
    }

    const page = await registryPage(registry, { repository, last, n: 100 }, refresh)

    for (const item of page.items) items.add(item)

    if (items.size > MAX_ITEMS) {
      throw new AppError(413, 'Browsing supports up to 10,000 repositories or tags per listing.')
    }

    if (!page.next) return { items: [...items] }

    if (page.next === last || cursors.has(page.next)) {
      throw new AppError(502, 'Registry returned a repeated pagination cursor.')
    }

    cursors.add(page.next)
    last = page.next
  }

  throw new AppError(502, 'Registry exceeded the supported listing page limit.')
}

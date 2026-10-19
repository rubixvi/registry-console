import 'server-only'

import { requireRepository } from '@/lib/registry/access'
import { readCursor } from '@/lib/registry/access/read-cursor'
import { visiblePage } from '@/lib/registry/access/visible-page'
import { loadPage } from '@/lib/registry/catalog/load-page'
import { type RegistryPage, type RegistryPageInput, type RegistryRecord } from '@/types/registry'

export async function registryPage(
  registry: RegistryRecord,
  input: RegistryPageInput,
  refresh = false
): Promise<RegistryPage> {
  if (input.repository) await requireRepository(registry, input.repository)

  const query = readCursor(registry, input)
  const page = await loadPage(registry, query, refresh)

  return visiblePage(registry, input, page)
}

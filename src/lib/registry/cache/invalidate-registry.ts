import 'server-only'

import { forget } from '@/lib/registry/cache/forget'
import { entries, state } from '@/lib/registry/cache/state'

export function invalidateRegistry(registryId: string): void {
  state.generation++

  for (const [id, entry] of entries) {
    if (entry.registryId === registryId) forget(id)
  }
}

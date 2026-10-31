import 'server-only'

import { forget } from '@/lib/registry/cache/forget'
import { cacheKey } from '@/lib/registry/cache/key'
import { state } from '@/lib/registry/cache/state'
import { type RegistryRecord } from '@/types/registry'

export function invalidateResponse(registry: RegistryRecord, path: string, scope?: string): void {
  state.generation++
  forget(cacheKey(registry, path, scope))
}

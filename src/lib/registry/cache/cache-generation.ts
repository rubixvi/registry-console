import 'server-only'

import { state } from '@/lib/registry/cache/state'

export function cacheGeneration(): number {
  return state.generation
}

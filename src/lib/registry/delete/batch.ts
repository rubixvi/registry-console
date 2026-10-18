import 'server-only'

import { worker } from '@/lib/registry/delete/worker'
import { type BatchState } from '@/types/registry-work'

export async function batch<T, R>(items: T[], operation: (item: T) => Promise<R>): Promise<R[]> {
  const state: BatchState<T, R> = { items, results: new Array<R>(items.length), cursor: 0 }

  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, () => worker(state, operation))
  )

  if (state.failure) throw state.failure.error

  return state.results
}

import 'server-only'

import { type BatchState } from '@/types/registry-work'

export async function worker<T, R>(
  state: BatchState<T, R>,
  operation: (item: T) => Promise<R>
): Promise<void> {
  while (state.cursor < state.items.length && !state.failure) {
    const index = state.cursor++

    try {
      state.results[index] = await operation(state.items[index])
    } catch (error) {
      state.failure ??= { error }
    }
  }
}

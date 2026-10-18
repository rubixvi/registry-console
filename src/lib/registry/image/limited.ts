import 'server-only'

import { type ImageInspection } from '@/types/registry-work'

export async function limited<T>(state: ImageInspection, operation: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    const start = () => {
      state.active++
      resolve()
    }

    if (state.active < 2) {
      start()
    } else {
      state.waiting.push(start)
    }
  })

  try {
    if (state.failure) {
      throw state.failure.error
    }

    return await operation()
  } finally {
    state.active--
    state.waiting.shift()?.()
  }
}

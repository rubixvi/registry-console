import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

const limits = new AsyncLocalStorage<boolean>()

export function withLimits<T>(enabled: boolean, task: () => T): T {
  return limits.run(enabled, task)
}

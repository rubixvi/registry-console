import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

const limits = new AsyncLocalStorage<boolean>()

export function hasLimits(): boolean {
  return limits.getStore() !== false
}

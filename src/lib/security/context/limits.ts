import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

export const limits = new AsyncLocalStorage<boolean>()

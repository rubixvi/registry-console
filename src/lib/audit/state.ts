import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

export const auditState = new AsyncLocalStorage<string>()

import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import { type Identity } from '@/types/auth'

export const accessState = new AsyncLocalStorage<{
  identity: Identity
  repositories: Map<string, Promise<boolean>>
}>()

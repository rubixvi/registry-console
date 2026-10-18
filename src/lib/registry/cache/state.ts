import 'server-only'

import { type CacheState, type Entry } from '@/types/cache'

export const globals = globalThis as typeof globalThis & {
  registryConsoleResponses?: CacheState
}

export const state = globals.registryConsoleResponses ?? {
  entries: new Map<string, Entry>(),
  bytes: 0,
  generation: 0,
}

globals.registryConsoleResponses = state

export const entries = state.entries

import 'server-only'

import { type TokenCache } from '@/types/registry'

export const tokens = new Map<string, TokenCache>()

export const pending = new Map<string, Promise<string>>()

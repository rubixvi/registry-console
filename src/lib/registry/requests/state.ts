import 'server-only'

import { type RegistryResponse } from '@/types/registry'

export const pending = new Map<string, Promise<RegistryResponse>>()

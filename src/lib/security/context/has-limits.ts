import 'server-only'

import { limits } from '@/lib/security/context'

export function hasLimits(): boolean {
  return limits.getStore() !== false
}

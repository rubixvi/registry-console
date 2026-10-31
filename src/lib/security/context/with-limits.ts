import 'server-only'

import { limits } from '@/lib/security/context'

export function withLimits<T>(enabled: boolean, task: () => T): T {
  return limits.run(enabled, task)
}

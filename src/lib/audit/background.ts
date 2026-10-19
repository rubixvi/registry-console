import 'server-only'

import { auditState } from '@/lib/audit/state'

export function auditBackground<T>(task: () => T): T {
  return auditState.run('', task)
}

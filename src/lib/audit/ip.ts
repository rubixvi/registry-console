import 'server-only'

import { auditState } from '@/lib/audit/state'

export function auditIp(): string {
  return auditState.getStore() ?? ''
}

import 'server-only'

import { auditState } from '@/lib/audit/state'
import { clientAddress } from '@/lib/auth/limit/client-address'
import { type AuditHandler } from '@/types/audit'

export function auditRequest<Args extends unknown[], Result>(
  handler: AuditHandler<Args, Result>
): AuditHandler<Args, Result> {
  return (request, ...args) => {
    let ip = ''

    try {
      ip = clientAddress(request) ?? ''
    } catch {
      ip = ''
    }

    return auditState.run(ip, () => handler(request, ...args))
  }
}

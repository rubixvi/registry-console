import 'server-only'

import { audit } from '@/lib/database/audit'
import { AppError } from '@/lib/security/error'

let windowExpires = 0
let records = 0

export function auditAuth(actor: string, action: string, error: unknown, path?: string): void {
  if (!(error instanceof AppError) || error.status >= 500) {
    return
  }

  const now = Date.now()

  if (now >= windowExpires) {
    windowExpires = now + 60_000
    records = 0
  }

  if (records >= 120) {
    return
  }

  records++
  audit(actor, action, JSON.stringify({ status: error.status, path }))
}

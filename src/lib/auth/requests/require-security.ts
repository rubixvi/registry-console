import 'server-only'

import { readRequest } from '@/lib/auth/requests/read-request'
import { AppError } from '@/lib/security/error'

export function requireSecurity(request: Request, username: string): void {
  const grant = readRequest(request, 'security')

  if (grant.username !== username || !grant.session_id) {
    throw new AppError(403, 'Verify your identity before changing security settings.')
  }
}

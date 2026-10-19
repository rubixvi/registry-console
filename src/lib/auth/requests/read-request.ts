import 'server-only'

import { findUser } from '@/lib/auth/accounts/find-user'
import { cookieName } from '@/lib/auth/requests/cookie-name'
import { cookieValue } from '@/lib/auth/requests/cookie-value'
import { sessionId } from '@/lib/auth/requests/session-id'
import { tokenHash } from '@/lib/auth/session'
import { userFingerprint } from '@/lib/config/users'
import { getRequest } from '@/lib/database/requests'
import { AppError } from '@/lib/security/error'
import { tokenSchema } from '@/lib/validation/auth'
import { type AuthRequest, type Purpose } from '@/types/security'

export function readRequest(request: Request, purpose: Purpose, consume = false): AuthRequest {
  const token = cookieValue(request, cookieName(purpose))

  if (!tokenSchema.safeParse(token).success) {
    throw new AppError(400, 'Verification expired. Please start again.')
  }

  const row = getRequest(tokenHash(token), purpose, consume)

  if (!row || row.attempts > 8) {
    throw new AppError(400, 'Verification expired. Please start again.')
  }

  if (row.username) {
    const user = findUser(row.username)

    if (!user || row.fingerprint !== userFingerprint(user)) {
      throw new AppError(401, 'Account configuration changed. Sign in again.')
    }
  }

  if (row.session_id && row.session_id !== sessionId(request)) {
    throw new AppError(403, 'Verification does not belong to this session.')
  }

  return row
}

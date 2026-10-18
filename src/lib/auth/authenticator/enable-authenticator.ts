import 'server-only'

import { securityId } from '@/lib/auth/accounts'
import { createSession } from '@/lib/auth/session'
import { getAuthenticator, recoveryCodes, recoveryHash, totpStep } from '@/lib/auth/totp'
import { audit } from '@/lib/database/audit'
import { insertAuthenticator } from '@/lib/database/authenticator'
import { clearRequests, consumeRequest } from '@/lib/database/requests'
import { clearSessions } from '@/lib/database/session'
import { transaction } from '@/lib/database/transaction'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'
import { type AuthRequest, type Enrollment } from '@/types/security'

export function enableAuthenticator(user: User, pending: AuthRequest, code: string): Enrollment {
  if (pending.purpose !== 'totp-setup' || pending.username !== user.username) {
    throw new AppError(403, 'Invalid authenticator setup.')
  }

  if (getAuthenticator(user)) {
    throw new AppError(400, 'Authenticator is already enabled.')
  }

  const step = totpStep(decryptSecret(pending.value), code)

  if (step === null) {
    throw new AppError(400, 'Invalid authenticator code.')
  }

  const codes = recoveryCodes()

  return transaction(() => {
    if (!consumeRequest(pending)) {
      throw new AppError(400, 'Authenticator setup expired. Please start again.')
    }

    if (getAuthenticator(user)) {
      throw new AppError(400, 'Authenticator is already enabled.')
    }

    insertAuthenticator({
      username: user.username,
      fingerprint: securityId(user),
      secret: pending.value,
      last_step: step,
      recovery: JSON.stringify(codes.map(recoveryHash)),
    })

    clearSessions(user.username)
    clearRequests(user.username)

    const session = createSession(user)

    audit(user.username, 'security.totp.enabled', '')

    return { codes, session }
  })
}

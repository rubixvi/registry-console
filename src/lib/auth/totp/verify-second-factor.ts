import 'server-only'

import { getAuthenticator } from '@/lib/auth/totp/get-authenticator'
import { recoveryHash } from '@/lib/auth/totp/recovery-hash'
import { totpStep } from '@/lib/auth/totp/totp-step'
import { updateRecovery, updateStep } from '@/lib/database/authenticator'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'

export function verifySecondFactor(user: User, code: string): void {
  const row = getAuthenticator(user)

  if (!row) {
    throw new AppError(401, 'Authenticator is not enabled.')
  }

  const step = totpStep(decryptSecret(row.secret), code)

  if (step !== null && step > row.last_step && updateStep(row, step)) {
    return
  }

  const stored = JSON.parse(row.recovery) as string[]
  const hash = recoveryHash(code)
  const remaining = stored.filter((entry) => entry !== hash)

  if (remaining.length < stored.length && updateRecovery(row, remaining)) {
    return
  }

  throw new AppError(401, 'Invalid or already used verification code.')
}

import 'server-only'

import { type NextResponse } from 'next/server'

import { loginResponse } from '@/lib/auth/response'
import { verifySecondFactor } from '@/lib/auth/totp'
import { consumeRequest } from '@/lib/database/requests'
import { transaction } from '@/lib/database/transaction'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'
import { type AuthRequest } from '@/types/security'

export function verifyLogin(user: User, pending: AuthRequest, code: string): NextResponse {
  if (pending.purpose !== 'two-factor' || pending.username !== user.username) {
    throw new AppError(400, 'Verification expired. Please sign in again.')
  }

  return transaction(() => {
    if (!consumeRequest(pending)) {
      throw new AppError(400, 'Verification expired. Please sign in again.')
    }

    verifySecondFactor(user, code)

    return loginResponse(user, 'two_factor')
  })
}

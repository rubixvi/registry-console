import 'server-only'

import { findUser } from '@/lib/auth/accounts'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'

export function configUser(username: string): User {
  const user = findUser(username)

  if (!user) {
    throw new AppError(401, 'Account is unavailable. Sign in again.')
  }

  return user
}

import 'server-only'

import { users } from '@/lib/config/users'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'

export function configUser(username: string): User {
  const user = users().find((entry) => entry.username === username)

  if (!user) {
    throw new AppError(401, 'Account is unavailable. Sign in again.')
  }

  return user
}

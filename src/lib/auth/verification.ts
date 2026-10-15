import 'server-only'

import { verifyPassword } from '@/lib/auth/password'
import { getAuthenticator, verifySecondFactor } from '@/lib/auth/totp'
import { users } from '@/lib/config/users'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { type User } from '@/types/auth'

export function configUser(username: string): User {
  const user = users().find((entry) => entry.username === username)

  if (!user) {
    throw new AppError(401, 'Account is unavailable. Sign in again.')
  }

  return user
}

export async function verifyAccount(
  username: string,
  password: string,
  code?: string
): Promise<User> {
  rateLimit(`security-verify:${username}`, 8, 15 * 60_000)

  const user = configUser(username)

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'Invalid password or verification code.')
  }

  if (getAuthenticator(user)) verifySecondFactor(user, code ?? '')

  return user
}

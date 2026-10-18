import 'server-only'

import { verifyCredentials } from '@/lib/auth/credentials'
import { getAuthenticator, verifySecondFactor } from '@/lib/auth/totp'
import { configUser } from '@/lib/auth/verification/config-user'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { type User } from '@/types/auth'

export async function verifyAccount(
  username: string,
  password: string,
  code?: string
): Promise<User> {
  rateLimit(`security-verify:${username}`, 8, 15 * 60_000)

  const user = configUser(username)

  if (!(await verifyCredentials(password, user))) {
    throw new AppError(401, 'Invalid password or verification code.')
  }

  if (getAuthenticator(user)) verifySecondFactor(user, code ?? '')

  return user
}

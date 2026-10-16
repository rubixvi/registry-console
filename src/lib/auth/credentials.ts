import 'server-only'

import { verifyLdapPassword } from '@/lib/auth/ldap'
import { verifyPassword } from '@/lib/auth/password'
import { type User } from '@/types/auth'

export async function verifyCredentials(password: string, user?: User): Promise<boolean> {
  if (user?.authProvider === 'ldap') {
    return verifyLdapPassword(user.username, password)
  }

  return verifyPassword(password, user?.passwordHash)
}

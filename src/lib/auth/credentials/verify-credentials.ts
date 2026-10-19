import 'server-only'

import { authenticateDirectory } from '@/lib/auth/directory/authenticate'
import { verifyLdapPassword } from '@/lib/auth/ldap'
import { verifyPassword } from '@/lib/auth/password'
import { type User } from '@/types/auth'

export async function verifyCredentials(password: string, user?: User): Promise<boolean> {
  if (user?.authProvider === 'sso') return false

  if (user?.authProvider === 'ldap') {
    if (user.directory) {
      const current = await authenticateDirectory(user.username, password)

      return (
        current?.id === user.id &&
        current?.role === user.role &&
        current?.directory?.subject === user.directory.subject
      )
    }

    return verifyLdapPassword(user.username, password)
  }

  return verifyPassword(password, user?.passwordHash)
}

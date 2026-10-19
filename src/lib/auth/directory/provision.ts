import 'server-only'

import { randomUUID } from 'node:crypto'

import { securityId } from '@/lib/auth/accounts/security-id'
import { directoryConfig } from '@/lib/auth/directory/config'
import { directoryUser } from '@/lib/auth/directory/user'
import { users } from '@/lib/config/users'
import { clearAccount, emailAccount, getAccount, updateAccount } from '@/lib/database/accounts'
import { audit } from '@/lib/database/audit'
import {
  deleteDirectory,
  directoryRecord,
  directorySubject,
  saveDirectory,
} from '@/lib/database/directory'
import { clearRequests } from '@/lib/database/requests'
import { clearSessions } from '@/lib/database/session'
import { transaction } from '@/lib/database/transaction'
import { AppError } from '@/lib/security/error'
import { type DirectoryProfile, type DirectoryUser } from '@/types/directory'

export function provisionDirectory(
  profile: DirectoryProfile,
  settings = directoryConfig()
): DirectoryUser {
  return transaction(() => {
    if (
      users().some(
        (user) =>
          user.username.toLowerCase() === profile.username.toLowerCase() ||
          (profile.email && user.email === profile.email)
      )
    ) {
      throw new AppError(403, 'Directory identity conflicts with a configured account.')
    }

    const previous = directorySubject(settings.source, profile.subject)
    const occupied = directoryRecord(profile.username)
    const email = profile.email ? emailAccount(profile.email) : undefined

    if (email && email.username !== previous?.username && email.username !== occupied?.username) {
      throw new AppError(403, 'Directory email is already assigned to another account.')
    }

    if (occupied && occupied.id !== previous?.id) {
      clearAccount(occupied.username)
      deleteDirectory(occupied.username)
      audit('system:ldap', 'security.account.replaced', occupied.username)
    }

    if (previous && previous.username !== profile.username) {
      const collision = getAccount(profile.username)

      if (collision)
        throw new AppError(403, 'Directory username is already assigned to another account.')

      updateAccount(profile.username, profile.email ?? '', previous.username)
      audit('system:ldap', 'security.account.renamed', profile.username)
    }

    if (
      previous &&
      (previous.role !== profile.role ||
        previous.email !== (profile.email ?? '') ||
        previous.policy !== settings.policy)
    ) {
      clearSessions(previous.username)
      clearRequests(previous.username)
      audit('system:ldap', 'security.directory.changed', profile.username)
    }

    saveDirectory({
      id: previous?.id ?? randomUUID(),
      source: settings.source,
      subject: profile.subject,
      username: profile.username,
      email: profile.email ?? '',
      role: profile.role,
      policy: settings.policy,
      checked: Date.now(),
      active: 1,
    })

    const user = directoryUser(profile.username)!

    securityId(user)
    if (!previous) audit('system:ldap', 'security.directory.provisioned', profile.username)

    return user
  })
}

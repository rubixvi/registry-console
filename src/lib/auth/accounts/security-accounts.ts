import 'server-only'

import { securityId } from '@/lib/auth/accounts/security-id'
import { accountNames, clearAccount } from '@/lib/database/accounts'
import { audit } from '@/lib/database/audit'
import { transaction } from '@/lib/database/transaction'
import { type User } from '@/types/auth'

export function securityAccounts(configured: User[]): void {
  transaction(() => {
    const usernames = new Set(configured.map((user) => user.username))

    for (const username of accountNames()) {
      if (usernames.has(username)) {
        continue
      }

      clearAccount(username)
      audit('system', 'security.account.removed', username)
    }

    for (const user of configured) {
      securityId(user)
    }
  })
}

import 'server-only'

import { randomUUID } from 'node:crypto'

import {
  clearAccount,
  emailAccount,
  getAccount,
  insertAccount,
  migrateAccount,
  updateAccount,
} from '@/lib/database/accounts'
import { audit } from '@/lib/database/audit'
import { transaction } from '@/lib/database/transaction'
import { type User } from '@/types/auth'

export function securityId(user: User): string {
  const id = user.id ?? ''
  const email = user.email ?? ''

  return transaction(() => {
    const current = getAccount(user.username)

    if (current?.configured_id === id) {
      if (current.email !== email) {
        updateAccount(user.username, email)
      }

      return current.account_id
    }

    if (!current && email) {
      const linked = emailAccount(email)

      if (linked?.configured_id === id) {
        updateAccount(user.username, email, linked.username)
        audit('system', 'security.account.renamed', user.username)

        return linked.account_id
      }
    }

    if (current) {
      clearAccount(user.username)
      audit('system', 'security.account.replaced', user.username)
    }

    const accountId = randomUUID()

    insertAccount({
      username: user.username,
      account_id: accountId,
      configured_id: id,
      email,
    })

    if (migrateAccount(user.username, accountId)) {
      audit('system', 'security.account.migrated', user.username)
    }

    return accountId
  })
}

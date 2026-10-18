import 'server-only'

import { randomUUID } from 'node:crypto'

import {
  accountNames,
  clearAccount,
  getAccount,
  insertAccount,
  migrateAccount,
} from '@/lib/database/accounts'
import { audit } from '@/lib/database/audit'
import { transaction } from '@/lib/database/transaction'
import { type User } from '@/types/auth'

export function securityId(user: User): string {
  const configuredId = user.id ?? ''
  const current = getAccount(user.username)

  if (current?.configured_id === configuredId) {
    return current.account_id
  }

  return transaction(() => {
    const existing = getAccount(user.username)

    if (existing?.configured_id === configuredId) {
      return existing.account_id
    }

    if (existing) {
      clearAccount(user.username)
      audit('system', 'security.account.replaced', user.username)
    }

    const accountId = randomUUID()

    insertAccount({
      username: user.username,
      account_id: accountId,
      configured_id: configuredId,
    })

    if (migrateAccount(user.username, accountId)) {
      audit('system', 'security.account.migrated', user.username)
    }

    return accountId
  })
}

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

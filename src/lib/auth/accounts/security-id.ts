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
  const current = getAccount(user.username)

  if (current?.configured_id === id) {
    if (current.email !== (user.email ?? '')) updateAccount(user.username, user.email ?? '')
    return current.account_id
  }

  return transaction(() => {
    const linked = user.email ? emailAccount(user.email) : undefined

    if (!current && linked && linked.configured_id === id) {
      updateAccount(user.username, user.email!, linked.username)
      audit('system', 'security.account.renamed', user.username)
      return linked.account_id
    }

    const existing = getAccount(user.username)

    if (existing?.configured_id === id) {
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
      configured_id: id,
      email: user.email ?? '',
    })

    if (migrateAccount(user.username, accountId)) {
      audit('system', 'security.account.migrated', user.username)
    }

    return accountId
  })
}

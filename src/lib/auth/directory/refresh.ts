import 'server-only'

import { directoryProfile, provisionDirectory, withDirectory } from '@/lib/auth/directory'
import { escapeLdapFilter } from '@/lib/auth/ldap'
import { env } from '@/lib/config/env'
import { audit } from '@/lib/database/audit'
import { directoryRecord, disableDirectory } from '@/lib/database/directory'
import { transaction } from '@/lib/database/transaction'
import { createGate } from '@/lib/security/gate'
import { type User } from '@/types/auth'

const pending = new Map<string, Promise<void>>()
const enter = createGate(4, 1)

export async function refreshDirectory(user: User): Promise<void> {
  if (!user.directory) return

  const row = directoryRecord(user.username)

  if (!row?.active || row.checked + env().LDAP_CHECK_SECONDS * 1000 > Date.now()) return

  const key = `${row.source}:${row.subject}`
  const existing = pending.get(key)

  if (existing) return existing

  const task = (async () => {
    const release = await enter(user.role === 'admin')

    try {
      await withDirectory(async (client, settings) => {
        const value = row.subject.startsWith('b:')
          ? row.subject.slice(2).replace(/../g, (byte) => `\\${byte}`)
          : escapeLdapFilter(row.subject.slice(2))
        const profile = await directoryProfile(
          client,
          settings,
          `(${settings.config.LDAP_ID_ATTRIBUTE}=${value})`
        )

        if (!profile || profile.subject !== row.subject || settings.source !== row.source) {
          transaction(() => {
            disableDirectory(row.username)
            audit('system:ldap', 'security.directory.revoked', row.username)
          })
          return
        }

        provisionDirectory(profile, settings)
      })
    } finally {
      release()
    }
  })()

  pending.set(key, task)

  try {
    await task
  } finally {
    if (pending.get(key) === task) pending.delete(key)
  }
}

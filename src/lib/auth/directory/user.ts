import 'server-only'

import { directoryConfig } from '@/lib/auth/directory/config'
import { env } from '@/lib/config/env'
import { directoryRecord } from '@/lib/database/directory'
import { type DirectoryUser } from '@/types/directory'

export function directoryUser(username: string): DirectoryUser | undefined {
  if (env().LDAP_ENABLED !== 'true') return undefined

  const row = directoryRecord(username)

  if (!row?.active) return undefined

  const settings = directoryConfig()

  if (row.source !== settings.source || row.policy !== settings.policy) return undefined

  return {
    id: row.id,
    username: row.username,
    ...(row.email ? { email: row.email } : {}),
    role: row.role,
    authProvider: 'ldap',
    directory: { source: row.source, subject: row.subject },
  }
}

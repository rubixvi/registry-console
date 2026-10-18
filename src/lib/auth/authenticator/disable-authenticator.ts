import 'server-only'

import { audit } from '@/lib/database/audit'
import { deleteAuthenticator } from '@/lib/database/authenticator'
import { clearRequests } from '@/lib/database/requests'
import { clearSessions } from '@/lib/database/session'
import { transaction } from '@/lib/database/transaction'

export function disableAuthenticator(username: string): void {
  transaction(() => {
    deleteAuthenticator(username)
    clearRequests(username)
    clearSessions(username)

    audit(username, 'security.totp.disabled', '')
  })
}

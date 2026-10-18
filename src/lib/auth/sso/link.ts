import 'server-only'

import { securityId } from '@/lib/auth/accounts'
import { users } from '@/lib/config/users'
import { audit } from '@/lib/database/audit'
import { accountLink, findLink, insertLink } from '@/lib/database/sso'
import { transaction } from '@/lib/database/transaction'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'
import { type SsoProfile } from '@/types/sso'

export function linkUser(provider: string, profile: SsoProfile): User {
  const user = users().find((entry) => entry.email === profile.email)

  if (!user || user.authProvider === 'ldap') {
    throw new AppError(403, 'This email is not configured for SSO access.')
  }

  return transaction(() => {
    const account = securityId(user)
    const existing = findLink(provider, profile.issuer, profile.subject)
    const current = accountLink(provider, account)

    if (
      (existing && existing.account_id !== account) ||
      (current && (current.issuer !== profile.issuer || current.subject !== profile.subject))
    ) {
      throw new AppError(403, 'This provider identity does not match the linked account.')
    }

    if (!existing) {
      insertLink({
        provider,
        issuer: profile.issuer,
        subject: profile.subject,
        account_id: account,
      })
      audit(user.username, 'security.sso.linked', provider)
    }

    return user
  })
}

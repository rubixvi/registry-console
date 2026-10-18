import 'server-only'

import { database } from '@/lib/database/client'
import { type SsoLink } from '@/types/sso'

export function findLink(provider: string, issuer: string, subject: string): SsoLink | undefined {
  return database()
    .prepare('SELECT * FROM sso_links WHERE provider = ? AND issuer = ? AND subject = ?')
    .get(provider, issuer, subject) as SsoLink | undefined
}

export function accountLink(provider: string, account: string): SsoLink | undefined {
  return database()
    .prepare('SELECT * FROM sso_links WHERE provider = ? AND account_id = ?')
    .get(provider, account) as SsoLink | undefined
}

export function insertLink(row: SsoLink): void {
  database()
    .prepare('INSERT INTO sso_links (provider, issuer, subject, account_id) VALUES (?, ?, ?, ?)')
    .run(row.provider, row.issuer, row.subject, row.account_id)
}

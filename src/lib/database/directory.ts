import 'server-only'

import { database } from '@/lib/database/client'
import { clearRequests } from '@/lib/database/requests'
import { clearSessions } from '@/lib/database/session'
import { type DirectoryRow } from '@/types/directory'

export function directoryRecord(username: string): DirectoryRow | undefined {
  return database()
    .prepare('SELECT * FROM directory_users WHERE username = ? COLLATE NOCASE')
    .get(username) as DirectoryRow | undefined
}

export function directorySubject(source: string, subject: string): DirectoryRow | undefined {
  return database()
    .prepare('SELECT * FROM directory_users WHERE source = ? AND subject = ?')
    .get(source, subject) as DirectoryRow | undefined
}

export function directoryRecords(): DirectoryRow[] {
  return database()
    .prepare('SELECT * FROM directory_users ORDER BY username')
    .all() as DirectoryRow[]
}

export function saveDirectory(row: DirectoryRow): void {
  database()
    .prepare(`
    INSERT INTO directory_users (id, source, subject, username, email, role, policy, checked, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (source, subject) DO UPDATE SET
      username = excluded.username, email = excluded.email, role = excluded.role,
      policy = excluded.policy, checked = excluded.checked, active = excluded.active
  `)
    .run(
      row.id,
      row.source,
      row.subject,
      row.username,
      row.email,
      row.role,
      row.policy,
      row.checked,
      row.active
    )
}

export function disableDirectory(username: string): void {
  database()
    .prepare('UPDATE directory_users SET active = 0 WHERE username = ? COLLATE NOCASE')
    .run(username)
  clearSessions(username)
  clearRequests(username)
}

export function deleteDirectory(username: string): void {
  database().prepare('DELETE FROM directory_users WHERE username = ? COLLATE NOCASE').run(username)
}

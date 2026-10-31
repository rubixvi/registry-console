import 'server-only'

import { database } from '@/lib/database/client'
import { type Filter, type Insert, type Remove, type Update } from '@/types/passkey'
import { type PasskeyRow } from '@/types/security'

export function deletePasskey({ id, username, fingerprint }: Remove): void {
  database()
    .prepare('DELETE FROM passkeys WHERE id = ? AND username = ? AND fingerprint = ?')
    .run(id, username, fingerprint)
}

export function getPasskey(id: string): PasskeyRow | undefined {
  return database().prepare('SELECT * FROM passkeys WHERE id = ?').get(id) as PasskeyRow | undefined
}

export function insertPasskey(value: Insert): void {
  const { id, username, fingerprint, userId, publicKey, counter, transports, name } = value
  const encoded = Buffer.from(publicKey).toString('base64url')
  const serialized = JSON.stringify(transports)
  const created = new Date().toISOString()

  database()
    .prepare(`
        INSERT INTO passkeys
          (id, username, fingerprint, user_id, public_key, counter, transports, name, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
    .run(id, username, fingerprint, userId, encoded, counter, serialized, name, created)
}

export function listPasskeys({ username, fingerprint }: Filter): PasskeyRow[] {
  return database()
    .prepare(`
      SELECT * FROM passkeys
      WHERE username = ? AND fingerprint = ?
      ORDER BY created
    `)
    .all(username, fingerprint) as PasskeyRow[]
}

export function updatePasskey({ id, fingerprint, counter, previous }: Update): boolean {
  const result = database()
    .prepare(`
      UPDATE passkeys
      SET counter = ?, last_used = ?
      WHERE id = ? AND fingerprint = ? AND counter = ?
    `)
    .run(counter, new Date().toISOString(), id, fingerprint, previous)

  return result.changes === 1
}

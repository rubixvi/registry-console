import 'server-only'

import { createHmac, hkdfSync } from 'node:crypto'

import { env } from '@/lib/config/env'

// These inputs contain connection revisions and public metadata, never passwords.
// Domain separation prevents identifiers for different purposes from colliding.
export function keyedFingerprint(purpose: string, value: unknown): string {
  const key = hkdfSync(
    'sha256',
    Buffer.from(env().ENCRYPTION_KEY, 'hex'),
    'registry-console',
    `fingerprint:${purpose}`,
    32
  )

  return createHmac('sha256', key).update(JSON.stringify(value)).digest('hex')
}

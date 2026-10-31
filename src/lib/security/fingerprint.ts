import 'server-only'

import { createHmac, hkdfSync } from 'node:crypto'

import { env } from '@/lib/config/env'

export function fingerprint(purpose: string, value: unknown): string {
  const config = env()

  const key = hkdfSync(
    'sha256',
    Buffer.from(config.ENCRYPTION_KEY, 'hex'),
    'registry-console',
    `fingerprint:${purpose}`,
    32
  )

  return createHmac('sha256', key).update(JSON.stringify(value)).digest('hex')
}

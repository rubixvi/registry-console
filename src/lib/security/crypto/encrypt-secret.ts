import 'server-only'

import { createCipheriv, randomBytes } from 'node:crypto'

import { env } from '@/lib/config/env'
import { ALGORITHM, VERSION } from '@/lib/security/crypto'
import { secretKeys } from '@/lib/security/keys'

export function encryptSecret(value: string): string {
  if (!value) return ''

  const config = env()

  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex')
  const id = config.ENCRYPTION_KEY_ID
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  secretKeys()
  cipher.setAAD(Buffer.from(`registry-console:${VERSION}:${id}`))

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

  const parts = [
    VERSION,
    id,
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ]

  return parts.join('.')
}

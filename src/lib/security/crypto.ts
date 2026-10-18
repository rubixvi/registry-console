import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { env } from '@/lib/config/env'
import { secretKeys } from '@/lib/security/keys'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v2'
const IV_PATTERN = /^[a-f0-9]{24}$/
const TAG_PATTERN = /^[a-f0-9]{32}$/
const DATA_PATTERN = /^(?:[a-f0-9]{2})+$/

export function encryptSecret(value: string): string {
  if (!value) return ''

  const key = Buffer.from(env().ENCRYPTION_KEY, 'hex')
  const id = env().ENCRYPTION_KEY_ID
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

export function decryptSecret(value: string): string {
  if (!value) return ''

  const parts = value.split('.')
  const version = parts[0]
  const id = version === 'v2' ? parts[1] : undefined
  const [iv, tag, data] = parts.slice(version === 'v2' ? 2 : 1)

  if (
    (version !== 'v1' && version !== 'v2') ||
    parts.length !== (version === 'v2' ? 5 : 4) ||
    (version === 'v2' && (!id || !/^[a-zA-Z0-9_-]{1,32}$/.test(id))) ||
    !iv ||
    !tag ||
    !data ||
    !IV_PATTERN.test(iv) ||
    !TAG_PATTERN.test(tag) ||
    !DATA_PATTERN.test(data)
  ) {
    throw new Error('Invalid encrypted secret')
  }

  const keys = secretKeys()
  const candidates = id ? [keys.get(id)].filter((key) => key !== undefined) : [...keys.values()]

  for (const key of candidates) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))

      if (id) decipher.setAAD(Buffer.from(`registry-console:${version}:${id}`))
      decipher.setAuthTag(Buffer.from(tag, 'hex'))

      return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString(
        'utf8'
      )
    } catch {}
  }

  throw new Error('The encrypted secret could not be authenticated with the configured keys.')
}

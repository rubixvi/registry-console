import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { env } from '@/lib/config/env'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'
const IV_PATTERN = /^[a-f0-9]{24}$/
const TAG_PATTERN = /^[a-f0-9]{32}$/
const DATA_PATTERN = /^(?:[a-f0-9]{2})+$/

export function encryptSecret(value: string): string {
  if (!value) return ''

  const key = Buffer.from(env().ENCRYPTION_KEY, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

  const parts = [
    VERSION,
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ]

  return parts.join('.')
}

export function decryptSecret(value: string): string {
  if (!value) return ''

  const parts = value.split('.')
  const [version, iv, tag, data] = parts

  if (
    parts.length !== 4 ||
    version !== VERSION ||
    !iv ||
    !tag ||
    !data ||
    !IV_PATTERN.test(iv) ||
    !TAG_PATTERN.test(tag) ||
    !DATA_PATTERN.test(data)
  ) {
    throw new Error('Invalid encrypted secret')
  }

  const key = Buffer.from(env().ENCRYPTION_KEY, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))

  decipher.setAuthTag(Buffer.from(tag, 'hex'))

  const decrypted = Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()])

  return decrypted.toString('utf8')
}

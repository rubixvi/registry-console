import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'

export const MIN_PASSWORD_LENGTH = 14
export const MAX_PASSWORD_LENGTH = 1024

const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}

export function hashPassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Password must contain ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`
    )
  }

  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32, SCRYPT_OPTIONS)

  return [
    'scrypt',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString('hex'),
    hash.toString('hex'),
  ].join('$')
}

export function encryptionKey(value = '') {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('ENCRYPTION_KEY requires 64 hexadecimal characters.')
  }

  return Buffer.from(value, 'hex')
}

export function encryptSecret(value, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

  return [
    'v1',
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ].join('.')
}

export function contentDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'

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

export function encryptSecret(value, key, id = process.env.ENCRYPTION_KEY_ID || 'main') {
  if (!value) return ''

  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id)) throw new Error('Invalid encryption key ID.')

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  cipher.setAAD(Buffer.from(`registry-console:v2:${id}`))

  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

  return [
    'v2',
    id,
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ].join('.')
}

export function secretKeys() {
  const previous = JSON.parse(process.env.ENCRYPTION_KEYS_JSON || '{}')
  const id = process.env.ENCRYPTION_KEY_ID || 'main'
  const key = encryptionKey(process.env.ENCRYPTION_KEY)

  if (
    !previous ||
    typeof previous !== 'object' ||
    Array.isArray(previous) ||
    Object.keys(previous).length > 16
  ) {
    throw new Error('Invalid decryption key configuration.')
  }

  const keys = new Map()

  for (const [name, value] of Object.entries(previous)) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) throw new Error('Invalid encryption key ID.')
    keys.set(name, encryptionKey(value))
  }

  if (keys.has(id) && !keys.get(id).equals(key))
    throw new Error('Active key ID conflicts with an old key.')

  keys.set(id, key)

  return keys
}

export function decryptSecret(value) {
  if (!value) return ''

  const parts = value.split('.')
  const version = parts[0]
  const id = version === 'v2' ? parts[1] : undefined
  const [iv, tag, data] = parts.slice(version === 'v2' ? 2 : 1)

  if (
    !['v1', 'v2'].includes(version) ||
    parts.length !== (id ? 5 : 4) ||
    !/^[a-f0-9]{24}$/.test(iv || '') ||
    !/^[a-f0-9]{32}$/.test(tag || '') ||
    !/^(?:[a-f0-9]{2})+$/.test(data || '')
  )
    throw new Error('Invalid encrypted secret.')

  const keys = secretKeys()
  const candidates = id ? [keys.get(id)].filter(Boolean) : [...keys.values()]

  for (const key of candidates) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))

      if (id) decipher.setAAD(Buffer.from(`registry-console:${version}:${id}`))
      decipher.setAuthTag(Buffer.from(tag, 'hex'))

      return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString(
        'utf8'
      )
    } catch {}
  }

  throw new Error('The encrypted secret could not be authenticated.')
}

export function contentDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

import { createCipheriv, randomBytes } from 'node:crypto'

import { readSecret } from './read-secret.mjs'

const encryptionKey = process.env.ENCRYPTION_KEY || ''

if (!/^[a-f0-9]{64}$/i.test(encryptionKey)) {
  throw new Error('ENCRYPTION_KEY must contain 64 hexadecimal characters.')
}

const password = await readSecret('Registry password: ')

if (!password) {
  throw new Error('Password cannot be empty.')
}

const key = Buffer.from(encryptionKey, 'hex')
const iv = randomBytes(12)
const cipher = createCipheriv('aes-256-gcm', key, iv)

const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])

const encoded = [
  'v1',
  iv.toString('hex'),
  cipher.getAuthTag().toString('hex'),
  encrypted.toString('hex'),
].join('.')

console.log(encoded)

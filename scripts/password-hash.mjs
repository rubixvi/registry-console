import { randomBytes, scryptSync } from 'node:crypto'

import { readSecret } from './read-secret.mjs'

const MIN_PASSWORD_LENGTH = 14
const MAX_PASSWORD_LENGTH = 1024

const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}

const password = await readSecret(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `)

if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
  throw new Error(`Password must contain ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`)
}

const salt = randomBytes(16)
const hash = scryptSync(password, salt, 32, SCRYPT_OPTIONS)

const encoded = ['scrypt', '32768', '8', '1', salt.toString('hex'), hash.toString('hex')].join('$')

console.log(encoded)

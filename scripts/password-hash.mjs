import { hashPassword, MIN_PASSWORD_LENGTH } from './helpers/crypto.mjs'
import { readSecret } from './helpers/input.mjs'

const password = await readSecret(`Password (${MIN_PASSWORD_LENGTH}+ characters): `)

console.log(hashPassword(password))

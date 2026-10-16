import { encryptionKey, encryptSecret } from './helpers/crypto.mjs'
import { readSecret } from './helpers/input.mjs'

const key = encryptionKey(process.env.ENCRYPTION_KEY)
const password = await readSecret('Registry password: ')

if (!password) {
  throw new Error('Password cannot be empty.')
}

console.log(encryptSecret(password, key))

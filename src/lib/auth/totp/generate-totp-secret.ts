import 'server-only'

import { randomBytes } from 'node:crypto'

import { ALPHABET } from '@/lib/auth/totp/constants'

export function generateTotpSecret(): string {
  const bytes = randomBytes(20)
  let bits = ''

  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0')
  }

  return bits
    .match(/.{5}/g)!
    .map((part) => ALPHABET[Number.parseInt(part, 2)])
    .join('')
}

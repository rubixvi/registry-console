import 'server-only'

import { createHmac } from 'node:crypto'

import { ALPHABET } from '@/lib/auth/totp/constants'

export function totpCode(secret: string, step: number): string {
  const bits = [...secret]
    .map((letter) => ALPHABET.indexOf(letter).toString(2).padStart(5, '0'))
    .join('')
  const key = Buffer.from(bits.match(/.{8}/g)!.map((part) => Number.parseInt(part, 2)))
  const counter = Buffer.alloc(8)

  counter.writeBigUInt64BE(BigInt(step))

  const digest = createHmac('sha1', key).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  const value = digest.readUInt32BE(offset) & 0x7fffffff

  return String(value % 1_000_000).padStart(6, '0')
}

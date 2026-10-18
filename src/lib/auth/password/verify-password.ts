import 'server-only'

import { scrypt, timingSafeEqual } from 'node:crypto'

import { passwordHashSchema } from '@/lib/validation/auth'

const DUMMY_HASH = ['scrypt', '32768', '8', '1', '0'.repeat(32), '0'.repeat(64)].join('$')

const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}

export async function verifyPassword(password: string, stored = DUMMY_HASH): Promise<boolean> {
  const parsed = passwordHashSchema.safeParse(stored)

  if (!parsed.success) return false

  const [, , , , salt, hash] = parsed.data.split('$')
  const expected = Buffer.from(hash, 'hex')

  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, 'hex'), expected.length, SCRYPT_OPTIONS, (error, key) => {
      if (error) {
        reject(error)
        return
      }

      resolve(key)
    })
  })

  return timingSafeEqual(derived, expected)
}

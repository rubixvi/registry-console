import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { securityId } from '@/lib/auth/accounts'
import { tokenHash } from '@/lib/auth/session'
import { findAuthenticator, updateRecovery, updateStep } from '@/lib/database/authenticator'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { type User } from '@/types/auth'
import { type AuthenticatorRow } from '@/types/security'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

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

export function totpStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) {
    return null
  }

  const step = Math.floor(now / 30_000)

  for (const offset of [0, -1, 1]) {
    const candidate = step + offset

    if (
      candidate >= 0 &&
      timingSafeEqual(Buffer.from(totpCode(secret, candidate)), Buffer.from(code))
    ) {
      return candidate
    }
  }

  return null
}

export function getAuthenticator(user: User): AuthenticatorRow | undefined {
  return findAuthenticator(user.username, securityId(user))
}

export function recoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => randomBytes(10).toString('hex').match(/.{5}/g)!.join('-'))
}

export function recoveryHash(code: string): string {
  return tokenHash(code.toLowerCase().replaceAll('-', '').trim())
}

export function verifySecondFactor(user: User, code: string): void {
  const row = getAuthenticator(user)

  if (!row) {
    throw new AppError(401, 'Authenticator is not enabled.')
  }

  const step = totpStep(decryptSecret(row.secret), code)

  if (step !== null && step > row.last_step && updateStep(row, step)) {
    return
  }

  const stored = JSON.parse(row.recovery) as string[]
  const hash = recoveryHash(code)
  const remaining = stored.filter((entry) => entry !== hash)

  if (remaining.length < stored.length && updateRecovery(row, remaining)) {
    return
  }

  throw new AppError(401, 'Invalid or already used verification code.')
}

import 'server-only'

import { timingSafeEqual } from 'node:crypto'

import { totpCode } from '@/lib/auth/totp/totp-code'

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

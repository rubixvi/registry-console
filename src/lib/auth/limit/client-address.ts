import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

import { env } from '@/lib/config/env'
import { AppError } from '@/lib/security/error'

export function clientAddress(request: Request): string | undefined {
  if (env().TRUST_PROXY === 'true') {
    const values = request.headers.get('x-forwarded-for')?.split(',') ?? []
    const address = values.at(-1)?.trim()

    if (!address || !isIP(address) || values.length > 16) {
      throw new AppError(400, 'A valid forwarded client address is required.')
    }

    return address.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '')
  }

  const key = process.env.REGISTRY_PEER_KEY
  const [address, timestamp, signature, extra] =
    request.headers.get('x-registry-peer')?.split(';') ?? []

  if (key && address && isIP(address) && timestamp && signature && !extra) {
    const age = Date.now() - Number(timestamp)
    const expected = createHmac('sha256', key).update(`${address};${timestamp}`).digest()
    const supplied = /^[a-f0-9]{64}$/.test(signature)
      ? Buffer.from(signature, 'hex')
      : Buffer.alloc(0)

    if (
      age >= 0 &&
      age <= 60_000 &&
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    ) {
      return address.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '')
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new AppError(
      503,
      'Client address is unavailable. Start the server with scripts/peer.mjs.'
    )
  }

  return undefined
}

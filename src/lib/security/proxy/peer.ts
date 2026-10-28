import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { AppError } from '@/lib/security/error'
import { ipAddress } from '@/lib/security/proxy'

export function peerAddress(request: Request): string | undefined {
  const key = process.env.REGISTRY_PEER_KEY

  const [address, timestamp, signature, extra] =
    request.headers.get('x-registry-peer')?.split(';') ?? []

  const peer = address ? ipAddress(address) : undefined

  if (key && peer && timestamp && signature && !extra) {
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
      return peer
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

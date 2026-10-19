import 'server-only'

import { AppError } from '@/lib/security/error'
import { ipAddress } from '@/lib/security/proxy/address'
import { trustedProxy } from '@/lib/security/proxy/trusted'

export function forwardedAddress(request: Request, peer?: string): string {
  const header = request.headers.get('x-forwarded-for')
  const values = header?.split(',') ?? []

  if (!header || header.length > 2048 || values.length > 16) {
    throw new AppError(400, 'A valid forwarded client address is required.')
  }

  let address = peer

  for (let index = values.length - 1; index >= 0; index--) {
    if (address && !trustedProxy(address)) return address

    const next = ipAddress(values[index].trim())

    if (!next) throw new AppError(400, 'A valid forwarded client address is required.')
    if (!peer) return next

    address = next
  }

  return address!
}

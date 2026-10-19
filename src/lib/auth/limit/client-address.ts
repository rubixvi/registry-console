import 'server-only'

import { env } from '@/lib/config/env'
import { forwardedAddress, peerAddress, trustedProxy } from '@/lib/security/proxy'

export function clientAddress(request: Request): string | undefined {
  const config = env()

  if (config.TRUST_PROXY === 'true' && !config.TRUSTED_PROXIES.length) {
    return forwardedAddress(request)
  }

  const peer = peerAddress(request)

  if (config.TRUST_PROXY !== 'true' || !peer || !trustedProxy(peer)) {
    return peer
  }

  return forwardedAddress(request, peer)
}

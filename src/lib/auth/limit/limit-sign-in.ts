import 'server-only'

import { clientAddress } from '@/lib/auth/limit/client-address'
import { rateLimit } from '@/lib/security/rate-limit'

export function limitSignIn(request: Request, method = 'password'): string {
  const source = clientAddress(request)

  if (source) rateLimit(`${method}-source:${source}`, 30, 15 * 60_000)

  return source ?? 'unavailable'
}

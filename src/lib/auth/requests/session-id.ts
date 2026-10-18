import 'server-only'

import { cookieValue } from '@/lib/auth/requests/cookie-value'
import { sessionCookieName, tokenHash } from '@/lib/auth/session'

export function sessionId(request: Request): string {
  return tokenHash(cookieValue(request, sessionCookieName()))
}

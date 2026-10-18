import 'server-only'

import { randomBytes } from 'node:crypto'
import { type NextResponse } from 'next/server'

import { cookieName } from '@/lib/auth/requests/cookie-name'
import { cookieOptions, tokenHash } from '@/lib/auth/session'
import { userFingerprint } from '@/lib/config/users'
import { insertRequest } from '@/lib/database/requests'
import { type User } from '@/types/auth'
import { type Purpose } from '@/types/security'

export function issueRequest(
  response: NextResponse,
  purpose: Purpose,
  user: User | null,
  value = '',
  session = ''
): void {
  const token = randomBytes(32).toString('base64url')
  const expires = Date.now() + 5 * 60_000

  insertRequest({
    id: tokenHash(token),
    purpose,
    username: user?.username ?? '',
    fingerprint: user ? userFingerprint(user) : '',
    session_id: session,
    value,
    expires,
  })

  response.cookies.set(cookieName(purpose), token, {
    ...cookieOptions(),
    expires: new Date(expires),
  })
}

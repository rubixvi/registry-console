import 'server-only'

import { type NextResponse } from 'next/server'

import { cookieName } from '@/lib/auth/requests/cookie-name'
import { cookieOptions } from '@/lib/auth/session'
import { type Purpose } from '@/types/security'

export function clearRequest(response: NextResponse, purpose: Purpose): void {
  response.cookies.set(cookieName(purpose), '', {
    ...cookieOptions(),
    maxAge: 0,
  })
}

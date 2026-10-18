import 'server-only'

import { env } from '@/lib/config/env'

export function cookieOptions() {
  const secure = new URL(env().APP_ORIGIN).protocol === 'https:'

  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
  }
}

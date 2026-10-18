import 'server-only'

import { cookies } from 'next/headers'

import { resolveSession } from '@/lib/auth/session/resolve-session'
import { sessionCookieName } from '@/lib/auth/session/session-cookie-name'
import { type Identity } from '@/types/auth'

export async function getIdentity(): Promise<Identity | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName())?.value

  return resolveSession(token)
}

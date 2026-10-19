import 'server-only'

import { cookies } from 'next/headers'

import { findUser } from '@/lib/auth/accounts/find-user'
import { refreshDirectory } from '@/lib/auth/directory/refresh'
import { resolveSession } from '@/lib/auth/session/resolve-session'
import { sessionCookieName } from '@/lib/auth/session/session-cookie-name'
import { type Identity } from '@/types/auth'

export async function getIdentity(): Promise<Identity | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName())?.value

  const identity = resolveSession(token)
  const user = identity ? findUser(identity.username) : undefined

  if (user?.directory) await refreshDirectory(user)

  return resolveSession(token)
}

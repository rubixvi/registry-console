import 'server-only'

import { cookies } from 'next/headers'

import { sessionCookieName } from '@/lib/auth/session/session-cookie-name'
import { tokenHash } from '@/lib/auth/session/token-hash'
import { deleteSession } from '@/lib/database/session'

export async function revokeSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(sessionCookieName())?.value

  if (!token) return

  deleteSession(tokenHash(token))
}

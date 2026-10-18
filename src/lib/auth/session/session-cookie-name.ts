import 'server-only'

import { env } from '@/lib/config/env'

export function sessionCookieName(): string {
  const secure = new URL(env().APP_ORIGIN).protocol === 'https:'

  if (secure) return '__Host-registry_session'

  return 'registry_session'
}

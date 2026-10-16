import 'server-only'

import { env } from '@/lib/config/env'

export function passkeyHost() {
  const origin = env().APP_ORIGIN

  return { origin, rpID: new URL(origin).hostname }
}

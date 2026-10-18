import 'server-only'

import { tokenHash } from '@/lib/auth/session'

export function recoveryHash(code: string): string {
  return tokenHash(code.toLowerCase().replaceAll('-', '').trim())
}

import 'server-only'

import { cookieOptions } from '@/lib/auth/session'
import { type Purpose } from '@/types/security'

export function cookieName(purpose: Purpose): string {
  return `${cookieOptions().secure ? '__Host-' : ''}registry_${purpose}`
}

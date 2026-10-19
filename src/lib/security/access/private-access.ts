import 'server-only'

import { accessState } from '@/lib/security/access/state'

export function privateAccess(): boolean {
  return accessState.getStore()?.identity.role !== 'viewer'
}

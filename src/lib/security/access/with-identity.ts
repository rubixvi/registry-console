import 'server-only'

import { accessState } from '@/lib/security/access/state'
import { type Identity } from '@/types/auth'

export function withIdentity<T>(identity: Identity, task: () => T): T {
  return accessState.run({ identity, repositories: new Map() }, task)
}

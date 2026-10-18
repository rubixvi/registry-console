import 'server-only'

import { deleteRegistry } from '@/lib/database/registry'
import { discardQueue } from '@/lib/database/scan'
import { invalidateRegistry } from '@/lib/registry/cache'
import { registryRow } from '@/lib/registry/store/registry-row'

export function removeRegistry(id: string): void {
  const current = registryRow(id)

  deleteRegistry(current.id)
  discardQueue(current.id)
  invalidateRegistry(current.id)
}

import 'server-only'

import { deleteRegistry } from '@/lib/database/registry'
import { transaction } from '@/lib/database/transaction'
import { invalidateRegistry } from '@/lib/registry/cache'
import { registryRow } from '@/lib/registry/store/registry-row'

export function removeRegistry(id: string): void {
  const current = registryRow(id)

  transaction(() => deleteRegistry(current.id))
  invalidateRegistry(current.id)
}

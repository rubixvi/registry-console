import 'server-only'

import { updateRegistryRow } from '@/lib/database/registry'
import { discardQueue } from '@/lib/database/scan'
import { invalidateRegistry } from '@/lib/registry/cache'
import { registryInput } from '@/lib/registry/store/registry-input'
import { registryRow } from '@/lib/registry/store/registry-row'
import { type RegistryInput } from '@/types/registry'

export function updateRegistry(id: string, input: RegistryInput): string {
  const current = registryRow(id)

  updateRegistryRow(registryInput(current.id, input))
  discardQueue(current.id)
  invalidateRegistry(current.id)

  return current.id
}

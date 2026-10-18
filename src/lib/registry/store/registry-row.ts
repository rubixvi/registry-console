import 'server-only'

import { getRegistryRow } from '@/lib/database/registry'
import { AppError } from '@/lib/security/error'
import { type RegistryRow } from '@/types/registry'

export function registryRow(id: string): RegistryRow {
  const row = getRegistryRow(id)

  if (!row) {
    throw new AppError(404, 'Registry connection not found.')
  }

  return row
}

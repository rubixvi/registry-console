import 'server-only'

import { AppError } from '@/lib/security/error'
import { type RegistryRecord } from '@/types/registry'

export function writable(registry: RegistryRecord): void {
  if (registry.readOnly) {
    throw new AppError(403, 'This registry is read only.')
  }
}

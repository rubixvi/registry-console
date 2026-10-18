import 'server-only'

import { randomUUID } from 'node:crypto'

import { countRegistries, insertRegistry } from '@/lib/database/registry'
import { MAX_REGISTRIES } from '@/lib/registry/store/constants'
import { registryInput } from '@/lib/registry/store/registry-input'
import { AppError } from '@/lib/security/error'
import { type RegistryInput } from '@/types/registry'

export function addRegistry(input: RegistryInput): string {
  if (countRegistries() >= MAX_REGISTRIES) {
    throw new AppError(409, 'Maximum of 50 connections reached.')
  }

  const id = randomUUID()

  insertRegistry(registryInput(id, input))

  return id
}

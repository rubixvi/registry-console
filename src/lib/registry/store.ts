import 'server-only'

import { randomUUID } from 'node:crypto'

import { env } from '@/lib/config/env'
import {
  countRegistries,
  deleteRegistry,
  getRegistryRow,
  insertRegistry,
  listRegistries,
  markSeeded,
  registrySeeded,
  updateRegistryRow,
} from '@/lib/database/registry'
import { discardQueue } from '@/lib/database/scan'
import { transaction } from '@/lib/database/transaction'
import { validateUrl } from '@/lib/registry/allowlist'
import { invalidateRegistry } from '@/lib/registry/cache'
import { dockerHubSettings } from '@/lib/registry/dockerhub-settings'
import { decryptSecret, encryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import {
  type Registry,
  type RegistryInput,
  type RegistryRecord,
  type RegistryRow,
} from '@/types/registry'

const MAX_REGISTRIES = 50

export function getRegistries(): Registry[] {
  return listRegistries().map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    pullUrl: row.pull_url,
    username: row.username,
    hasPassword: Boolean(row.password),
    readOnly: Boolean(row.read_only) || row.provider === 'dockerhub',
    provider: row.provider,
    namespace: row.namespace,
    trivyEnabled: env().TRIVY_ENABLED === 'true',
  }))
}

function registryRow(id: string): RegistryRow {
  const row = getRegistryRow(id)

  if (!row) {
    throw new AppError(404, 'Registry connection not found.')
  }

  return row
}

function registryInput(id: string, input: RegistryInput): RegistryRow {
  const url = validateUrl(input.url, input.provider)
  const password = encryptSecret(input.password)
  const settings = dockerHubSettings(input, url)

  return {
    id,
    name: input.name,
    url,
    pull_url: input.pullUrl,
    username: input.username,
    password,
    read_only: Number(input.readOnly || settings.provider === 'dockerhub'),
    provider: settings.provider,
    namespace: settings.namespace,
    revision: randomUUID(),
  }
}

export function getRegistry(id: string): RegistryRecord {
  const row = registryRow(id)

  return {
    id: row.id,
    name: row.name,
    url: validateUrl(row.url, row.provider),
    pullUrl: row.pull_url,
    username: row.username,
    password: row.password,
    revision: row.revision,
    readOnly: Boolean(row.read_only) || row.provider === 'dockerhub',
    provider: row.provider,
    namespace: row.namespace,
    trivyEnabled: env().TRIVY_ENABLED === 'true',
  }
}

export function addRegistry(input: RegistryInput): string {
  if (countRegistries() >= MAX_REGISTRIES) {
    throw new AppError(409, 'Maximum of 50 connections reached.')
  }

  const id = randomUUID()

  insertRegistry(registryInput(id, input))

  return id
}

export function updateRegistry(id: string, input: RegistryInput): string {
  const current = registryRow(id)

  updateRegistryRow(registryInput(current.id, input))
  discardQueue(current.id)
  invalidateRegistry(current.id)

  return current.id
}

export function removeRegistry(id: string): void {
  const current = registryRow(id)

  deleteRegistry(current.id)
  discardQueue(current.id)
  invalidateRegistry(current.id)
}

export function seedRegistry(): void {
  const url = process.env.REGISTRY_URL

  if (!url || registrySeeded()) return

  const password = process.env.REGISTRY_PASSWORD_ENCRYPTED || ''

  decryptSecret(password)

  transaction(() => {
    if (registrySeeded()) return

    insertRegistry({
      id: randomUUID(),
      name: process.env.REGISTRY_NAME || 'Primary registry',
      url: validateUrl(url),
      pull_url: '',
      username: process.env.REGISTRY_USERNAME || '',
      password,
      read_only: Number(process.env.REGISTRY_READ_ONLY === 'true'),
      provider: 'distribution',
      namespace: '',
      revision: randomUUID(),
    })
    markSeeded()
  })
}

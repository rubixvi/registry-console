import 'server-only'

import { randomUUID } from 'node:crypto'

import { env } from '@/lib/config/env'
import { database } from '@/lib/database/client'
import { validateUrl } from '@/lib/registry/allowlist'
import { invalidateRegistry } from '@/lib/registry/cache'
import { dockerHubSettings } from '@/lib/registry/dockerhub-settings'
import { decryptSecret, encryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import {
  type Registry,
  type RegistryCount,
  type RegistryInput,
  type RegistryRecord,
  type RegistryRow,
} from '@/types/registry'

const MAX_REGISTRIES = 50

export function getRegistries(): Registry[] {
  const rows = database()
    .prepare('SELECT * FROM registries ORDER BY name COLLATE NOCASE')
    .all() as RegistryRow[]

  return rows.map((row) => ({
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

export function getRegistry(id: string): RegistryRecord {
  const row = database().prepare('SELECT * FROM registries WHERE id = ?').get(id) as
    | RegistryRow
    | undefined

  if (!row) {
    throw new AppError(404, 'Registry connection not found.')
  }

  return {
    id: row.id,
    name: row.name,
    url: validateUrl(row.url),
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
  const db = database()
  const result = db.prepare('SELECT COUNT(*) AS count FROM registries').get() as RegistryCount

  if (result.count >= MAX_REGISTRIES) {
    throw new AppError(409, 'Maximum of 50 connections reached.')
  }

  const id = randomUUID()
  const url = validateUrl(input.url)
  const password = encryptSecret(input.password)
  const settings = dockerHubSettings(input, url)

  db.prepare(`
    INSERT INTO registries (
      id,
      name,
      url,
      pull_url,
      username,
      password,
      read_only,
      provider,
      namespace,
      revision
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    url,
    input.pullUrl,
    input.username,
    password,
    Number(input.readOnly || settings.provider === 'dockerhub'),
    settings.provider,
    settings.namespace,
    randomUUID()
  )

  return id
}

export function updateRegistry(id: string, input: RegistryInput): string {
  const current = getRegistry(id)
  const url = validateUrl(input.url)
  const password = encryptSecret(input.password)
  const settings = dockerHubSettings(input, url)

  database()
    .prepare(`
      UPDATE registries
      SET
        name = ?,
        url = ?,
        pull_url = ?,
        username = ?,
        password = ?,
        read_only = ?,
        provider = ?,
        namespace = ?,
        revision = ?
      WHERE id = ?
    `)
    .run(
      input.name,
      url,
      input.pullUrl,
      input.username,
      password,
      Number(input.readOnly || settings.provider === 'dockerhub'),
      settings.provider,
      settings.namespace,
      randomUUID(),
      current.id
    )

  invalidateRegistry(current.id)

  return current.id
}

export function removeRegistry(id: string): void {
  const current = getRegistry(id)

  database().prepare('DELETE FROM registries WHERE id = ?').run(current.id)
  invalidateRegistry(current.id)
}

export function seedRegistry(): void {
  const url = process.env.REGISTRY_URL

  if (!url) return

  const db = database()
  const seedQuery = db.prepare(`
    SELECT id FROM settings WHERE id = 'registry-seeded'
  `)

  if (seedQuery.get()) return

  const password = process.env.REGISTRY_PASSWORD_ENCRYPTED || ''

  decryptSecret(password)
  db.exec('BEGIN IMMEDIATE')

  try {
    if (!seedQuery.get()) {
      db.prepare(`
        INSERT INTO registries (
          id,
          name,
          url,
          pull_url,
          username,
          password,
          read_only,
          revision
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        process.env.REGISTRY_NAME || 'Primary registry',
        validateUrl(url),
        '',
        process.env.REGISTRY_USERNAME || '',
        password,
        Number(process.env.REGISTRY_READ_ONLY === 'true'),
        randomUUID()
      )

      db.prepare(`
        INSERT INTO settings (id, value)
        VALUES ('registry-seeded', 'true')
      `).run()
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }
}

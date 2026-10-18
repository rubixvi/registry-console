import 'server-only'

import { database } from '@/lib/database/client'
import { type RegistryCount, type RegistryRow } from '@/types/registry'

export function listRegistries(): RegistryRow[] {
  return database()
    .prepare('SELECT * FROM registries ORDER BY name COLLATE NOCASE')
    .all() as RegistryRow[]
}

export function getRegistryRow(id: string): RegistryRow | undefined {
  return database().prepare('SELECT * FROM registries WHERE id = ?').get(id) as
    | RegistryRow
    | undefined
}

export function countRegistries(): number {
  const row = database().prepare('SELECT COUNT(*) AS count FROM registries').get() as RegistryCount

  return row.count
}

export function insertRegistry(row: RegistryRow): void {
  database()
    .prepare(`
      INSERT INTO registries (
        id, name, url, pull_url, username, password, read_only, provider, namespace, revision
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      row.id,
      row.name,
      row.url,
      row.pull_url,
      row.username,
      row.password,
      row.read_only,
      row.provider,
      row.namespace,
      row.revision
    )
}

export function updateRegistryRow(row: RegistryRow): void {
  database()
    .prepare(`
      UPDATE registries
      SET name = ?, url = ?, pull_url = ?, username = ?, password = ?, read_only = ?,
        provider = ?, namespace = ?, revision = ?
      WHERE id = ?
    `)
    .run(
      row.name,
      row.url,
      row.pull_url,
      row.username,
      row.password,
      row.read_only,
      row.provider,
      row.namespace,
      row.revision,
      row.id
    )
}

export function deleteRegistry(id: string): void {
  const db = database()

  for (const table of ['image_scans', 'deletion_plans', 'scan_queue']) {
    db.prepare(`DELETE FROM ${table} WHERE registry_id = ?`).run(id)
  }

  db.prepare('DELETE FROM scan_discovery WHERE id = ?').run(id)
  db.prepare('DELETE FROM registries WHERE id = ?').run(id)
}

export function registrySeeded(): boolean {
  return Boolean(database().prepare("SELECT id FROM settings WHERE id = 'registry-seeded'").get())
}

export function markSeeded(): void {
  database().prepare("INSERT INTO settings (id, value) VALUES ('registry-seeded', 'true')").run()
}

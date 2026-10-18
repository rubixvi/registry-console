import 'server-only'

import { database } from '@/lib/database/client'
import { type DiscoveryRow } from '@/types/scan'

export function registerDiscovery(id: string, scope: string): void {
  database()
    .prepare(`
    INSERT INTO scan_discovery (id, scope, value, available, updated) VALUES (?, ?, '{}', 0, 0)
    ON CONFLICT(id) DO UPDATE SET scope = excluded.scope, value = '{}', available = 0
    WHERE scan_discovery.scope <> excluded.scope
  `)
    .run(id, scope)
}

export function nextDiscovery(): DiscoveryRow | undefined {
  return database()
    .prepare(`
    SELECT id, scope, value FROM scan_discovery WHERE available <= ?
    ORDER BY available, updated, id LIMIT 1
  `)
    .get(Date.now()) as DiscoveryRow | undefined
}

export function saveDiscovery(id: string, scope: string, value: unknown, delay: number): void {
  const now = Date.now()

  database()
    .prepare(`
    UPDATE scan_discovery SET value = ?, available = ?, updated = ? WHERE id = ? AND scope = ?
  `)
    .run(JSON.stringify(value), now + delay, now, id, scope)
}

export function discardDiscovery(id: string): void {
  database().prepare('DELETE FROM scan_discovery WHERE id = ?').run(id)
}

export function pauseDiscovery(id: string, scope: string, delay: number): void {
  database()
    .prepare('UPDATE scan_discovery SET available = ? WHERE id = ? AND scope = ?')
    .run(Date.now() + Math.min(delay, 24 * 60 * 60_000), id, scope)
}

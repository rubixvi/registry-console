import 'server-only'

import { randomUUID } from 'node:crypto'

import { env } from '@/lib/config/env'
import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
import { transaction } from '@/lib/database/transaction'
import { AppError } from '@/lib/security/error'
import {
  type QueuedScan,
  type ScanClaim,
  type ScanLease,
  type ScanRow,
  type ScanStatus,
  type ScanTarget,
} from '@/types/scan'

const HOUR = 60 * 60_000
const LEASE = 90_000
const MAX_PENDING = 10_000

export function getScan(id: string): ScanRow | undefined {
  return database()
    .prepare('SELECT status, value, expires FROM image_scans WHERE id = ?')
    .get(id) as ScanRow | undefined
}

export function adoptScan(id: string, previous: string): void {
  database()
    .prepare(`
      INSERT INTO image_scans (id, registry_id, status, value, expires, updated)
      SELECT ?, registry_id, status, value, 0, updated FROM image_scans
      WHERE id = ? AND status = 'complete'
      ON CONFLICT(id) DO NOTHING
    `)
    .run(id, previous)
}

export function scanDue(id: string): boolean {
  const row = getScan(id)

  return !row || (row.status !== 'complete' && row.expires <= Date.now())
}

export function scanDelay(): number {
  const now = Date.now()
  const limit = env().TRIVY_SCANS_PER_HOUR
  const rows = database()
    .prepare('SELECT started FROM scan_attempts WHERE started > ? ORDER BY started')
    .all(now - HOUR) as { started: number }[]
  const latest = rows.at(-1)?.started
  const interval = Math.ceil(HOUR / limit)
  const spaced = latest === undefined ? now : latest + interval
  const rolling = rows.length < limit ? now : rows[rows.length - limit].started + HOUR

  return Math.max(0, Math.ceil((Math.max(spaced, rolling) - now) / 1000))
}

export function queueScan(
  { id, registryId, repository, digest }: ScanTarget,
  actor = 'system:trivy',
  override = false
): boolean {
  const db = database()

  if (getScan(id)?.status === 'complete') {
    discardScan(id)
    return true
  }

  const result = db
    .prepare(`
    INSERT INTO scan_queue (id, registry_id, repository, digest, updated, actor, override)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM scan_queue) < ?
    ON CONFLICT(id) DO NOTHING
  `)
    .run(id, registryId, repository, digest, Date.now(), actor, Number(override), MAX_PENDING)

  if (actor !== 'system:trivy') {
    db.prepare('UPDATE scan_queue SET actor = ?, override = ?, available = 0 WHERE id = ?').run(
      actor,
      Number(override),
      id
    )
  }

  return (
    result.changes === 1 || Boolean(db.prepare('SELECT id FROM scan_queue WHERE id = ?').get(id))
  )
}

export function pendingScan(id?: string): QueuedScan | undefined {
  if (id) {
    return database()
      .prepare(`
        SELECT id, registry_id AS registryId, repository, digest, actor, override, available
        FROM scan_queue WHERE id = ?
      `)
      .get(id) as QueuedScan | undefined
  }

  return database()
    .prepare(`
      SELECT id, registry_id AS registryId, repository, digest, actor, override, available
      FROM scan_queue
      WHERE available <= ? ORDER BY override DESC, updated, rowid LIMIT 1
    `)
    .get(Date.now()) as QueuedScan | undefined
}

export function activeScan(): { id: string; value: string; expires: number } | undefined {
  return database()
    .prepare("SELECT id, value, expires FROM image_scans WHERE status = 'running' AND expires > ?")
    .get(Date.now()) as { id: string; value: string; expires: number } | undefined
}

export function discardScan(id: string): void {
  database().prepare('DELETE FROM scan_queue WHERE id = ?').run(id)
}

export function deferScan(id: string, seconds = 15): void {
  database()
    .prepare('UPDATE scan_queue SET available = ? WHERE id = ?')
    .run(Date.now() + Math.max(1, seconds) * 1000, id)
}

export function claimScan({
  id,
  registryId,
  repository,
  digest,
  actor,
  expires,
  override = false,
}: ScanClaim): ScanLease {
  const db = database()
  const now = Date.now()

  return transaction(() => {
    const current = getScan(id)

    if (current?.status === 'complete') {
      throw new AppError(409, 'This image digest has already been scanned.')
    }

    if (current?.status === 'running' && current.expires > now) {
      return { expires: current.expires, started: false }
    }

    if (activeScan()) {
      if (!queueScan({ id, registryId, repository, digest }, actor, override)) {
        throw new AppError(503, 'The scan queue is full. Retry later.')
      }

      audit(actor, 'image.scan.queued', `${registryId}/${repository}@${digest}`)

      return { expires: 0, started: false }
    }

    const delay = scanDelay()

    if (delay > 0 && !override) {
      throw new AppError(
        429,
        'The scan budget is currently used. This image can be scanned later.',
        delay
      )
    }

    db.prepare(`
      UPDATE image_scans SET status = 'failed', value = ?, expires = ?, updated = ?
      WHERE status = 'running' AND expires <= ?
    `).run(JSON.stringify({ error: 'The scan was interrupted or timed out.' }), now, now, now)

    db.prepare(`
      INSERT INTO image_scans (id, registry_id, status, value, expires, updated)
      VALUES (?, ?, 'running', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = 'running', value = excluded.value,
        expires = excluded.expires, updated = excluded.updated
    `).run(id, registryId, JSON.stringify({ actor, repository, digest }), expires, now)

    db.prepare(`
      INSERT INTO scan_queue (id, registry_id, repository, digest, updated, actor, override)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET actor = excluded.actor, override = excluded.override
    `).run(id, registryId, repository, digest, now, actor, Number(override))

    db.prepare('DELETE FROM scan_attempts WHERE started <= ?').run(now - HOUR)
    db.prepare('INSERT INTO scan_attempts (id, started) VALUES (?, ?)').run(randomUUID(), now)
    audit(actor, 'image.scan.started', `${registryId}/${repository}@${digest}`)

    if (delay > 0 && override) {
      audit(actor, 'image.scan.limit.overridden', `${registryId}/${repository}@${digest}`)
    }

    return { expires, started: true }
  })
}

export function finishScan(
  id: string,
  lease: number,
  value: Pick<ScanStatus, 'report' | 'error'>
): boolean {
  const db = database()
  const now = Date.now()

  return transaction(() => {
    const row = db.prepare('SELECT attempts FROM scan_queue WHERE id = ?').get(id) as
      | { attempts: number }
      | undefined
    const delay = Math.min(24 * HOUR, HOUR * 2 ** Math.min(row?.attempts ?? 0, 5))
    const expires = value.report ? 0 : now + delay
    const result = db
      .prepare(`
      UPDATE image_scans SET status = ?, value = ?, expires = ?, updated = ?
      WHERE id = ? AND status = 'running' AND expires = ?
    `)
      .run(value.report ? 'complete' : 'failed', JSON.stringify(value), expires, now, id, lease)

    if (result.changes === 1) {
      if (value.report) {
        discardScan(id)
      } else {
        db.prepare(`
          UPDATE scan_queue SET attempts = attempts + 1, available = ?, updated = ? WHERE id = ?
        `).run(expires, now, id)
      }
    }

    return result.changes === 1
  })
}

export function claimDiscovery(owner: string): boolean {
  const now = Date.now()
  const result = database()
    .prepare(`
    INSERT INTO scan_workers (id, owner, expires) VALUES ('trivy', ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires = excluded.expires
    WHERE scan_workers.expires <= ?
  `)
    .run(owner, now + LEASE, now)

  return result.changes === 1
}

export function renewDiscovery(owner: string): boolean {
  const now = Date.now()
  const result = database()
    .prepare(`
    UPDATE scan_workers SET expires = ? WHERE id = 'trivy' AND owner = ? AND expires > ?
  `)
    .run(now + LEASE, owner, now)

  return result.changes === 1
}

export function releaseDiscovery(owner: string): void {
  database()
    .prepare("UPDATE scan_workers SET owner = '', expires = 0 WHERE id = 'trivy' AND owner = ?")
    .run(owner)
}

export function discardQueue(registryId: string): void {
  const db = database()

  db.prepare('DELETE FROM scan_queue WHERE registry_id = ?').run(registryId)
  db.prepare('DELETE FROM scan_discovery WHERE id = ?').run(registryId)
}

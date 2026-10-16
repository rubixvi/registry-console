import 'server-only'

import { randomUUID } from 'node:crypto'

import { env } from '@/lib/config/env'
import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
import { AppError } from '@/lib/security/error'
import { type ScanStatus, type ScanTarget } from '@/types/scan'

type Scan = {
  status: ScanStatus['status']
  value: string
  expires: number
}

type Claim = ScanTarget & {
  actor: string
  expires: number
}

const HOUR = 60 * 60_000
const LEASE = 90_000
const MAX_PENDING = 10_000

export function getScan(id: string): Scan | undefined {
  return database()
    .prepare('SELECT status, value, expires FROM image_scans WHERE id = ?')
    .get(id) as Scan | undefined
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

export function queueScan({ id, registryId, repository, digest }: ScanTarget): boolean {
  const db = database()

  if (getScan(id)?.status === 'complete') {
    discardScan(id)
    return true
  }

  const result = db
    .prepare(`
    INSERT INTO scan_queue (id, registry_id, repository, digest, updated)
    SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM scan_queue) < ?
    ON CONFLICT(id) DO NOTHING
  `)
    .run(id, registryId, repository, digest, Date.now(), MAX_PENDING)

  return (
    result.changes === 1 || Boolean(db.prepare('SELECT id FROM scan_queue WHERE id = ?').get(id))
  )
}

export function pendingScan(): ScanTarget | undefined {
  return database()
    .prepare(`
      SELECT id, registry_id AS registryId, repository, digest FROM scan_queue
      WHERE available <= ? ORDER BY updated, rowid LIMIT 1
    `)
    .get(Date.now()) as ScanTarget | undefined
}

export function discardScan(id: string): void {
  database().prepare('DELETE FROM scan_queue WHERE id = ?').run(id)
}

export function claimScan({ id, registryId, repository, digest, actor, expires }: Claim): void {
  const db = database()
  const now = Date.now()

  db.exec('BEGIN IMMEDIATE')

  try {
    if (getScan(id)?.status === 'complete') {
      throw new AppError(409, 'This image digest has already been scanned.')
    }

    if (
      db.prepare("SELECT id FROM image_scans WHERE status = 'running' AND expires > ?").get(now)
    ) {
      throw new AppError(
        409,
        'A scan is already running. Wait for it to finish before starting another.'
      )
    }

    const delay = scanDelay()

    if (delay > 0) {
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
      VALUES (?, ?, 'running', '{}', ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = 'running', value = '{}',
        expires = excluded.expires, updated = excluded.updated
    `).run(id, registryId, expires, now)

    db.prepare(`
      INSERT INTO scan_queue (id, registry_id, repository, digest, updated)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(id, registryId, repository, digest, now)

    db.prepare('DELETE FROM scan_attempts WHERE started <= ?').run(now - HOUR)
    db.prepare('INSERT INTO scan_attempts (id, started) VALUES (?, ?)').run(randomUUID(), now)
    audit(actor, 'image.scan.started', `${registryId}/${repository}@${digest}`)

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }
}

export function finishScan(
  id: string,
  lease: number,
  value: Pick<ScanStatus, 'report' | 'error'>
): boolean {
  const db = database()
  const now = Date.now()

  db.exec('BEGIN IMMEDIATE')

  try {
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

    db.exec('COMMIT')

    return result.changes === 1
  } catch (error) {
    db.exec('ROLLBACK')

    throw error
  }
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

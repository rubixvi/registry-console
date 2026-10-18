import 'server-only'

import { env } from '@/lib/config/env'
import { database } from '@/lib/database/client'
import { type AuditEntry, type AuditInput, type AuditPage } from '@/types/audit'

export function audit(actor: string, action: string, target: string): void {
  const db = database()
  const timestamp = new Date().toISOString()

  db.prepare(`
    INSERT INTO audit (at, actor, action, target)
    VALUES (?, ?, ?, ?)
  `).run(timestamp, actor, action, target)

  const cutoff = new Date(Date.now() - env().AUDIT_RETENTION_DAYS * 86_400_000).toISOString()

  db.prepare('DELETE FROM audit WHERE at < ?').run(cutoff)
}

export function auditPage(input: AuditInput): AuditPage {
  const db = database()
  const conditions: string[] = []
  const values: (string | number)[] = []

  if (input.actor) {
    conditions.push('actor = ?')
    values.push(input.actor)
  }

  if (input.action) {
    conditions.push('action = ?')
    values.push(input.action)
  }

  if (input.query) {
    const query = `%${input.query.replace(/[\\%_]/g, '\\$&')}%`

    conditions.push(
      "(actor LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\')"
    )
    values.push(query, query, query)
  }

  if (input.from) {
    conditions.push('at >= ?')
    values.push(`${input.from}T00:00:00.000Z`)
  }

  if (input.to) {
    conditions.push('at <= ?')
    values.push(`${input.to}T23:59:59.999Z`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const count = db.prepare(`SELECT COUNT(*) AS count FROM audit ${where}`).get(...values) as {
    count: number
  }

  if (input.before) {
    conditions.push('id < ?')
    values.push(input.before)
  }

  const pageWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(`
      SELECT id, at, actor, action, target FROM audit
      ${pageWhere}
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(...values, input.n + 1) as AuditEntry[]

  const items = rows.slice(0, input.n)

  return {
    items,
    next: rows.length > input.n ? items[items.length - 1].id : null,
    total: count.count,
  }
}

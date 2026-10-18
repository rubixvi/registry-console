import 'server-only'

import { database } from '@/lib/database/client'
import { type PlanInput, type PlanRow } from '@/types/deletion'

export function insertPlan(row: PlanInput): void {
  const db = database()

  db.prepare('DELETE FROM deletion_plans WHERE expires <= ?').run(Date.now())
  db.prepare(`
    INSERT INTO deletion_plans (id, username, registry_id, session_id, repository, value, expires)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.username,
    row.registry_id,
    row.session_id,
    row.repository,
    row.value,
    row.expires
  )
}

export function findPlan(
  id: string,
  username: string,
  registryId: string,
  session: string
): PlanRow | undefined {
  return database()
    .prepare(`
      SELECT id, repository, value, expires FROM deletion_plans
      WHERE id = ? AND username = ? AND registry_id = ? AND session_id = ? AND expires > ?
    `)
    .get(id, username, registryId, session, Date.now()) as PlanRow | undefined
}

export function consumePlan(id: string): boolean {
  const row = database()
    .prepare('DELETE FROM deletion_plans WHERE id = ? AND expires > ? RETURNING id')
    .get(id, Date.now())

  return Boolean(row)
}

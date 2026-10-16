import 'server-only'

import { randomUUID } from 'node:crypto'

import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
import { registryRequest } from '@/lib/registry/client'
import { registryIdentity } from '@/lib/registry/identity'
import { imageManifest } from '@/lib/registry/image'
import { getRegistry } from '@/lib/registry/store'
import { AppError } from '@/lib/security/error'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import {
  type BulkDeletionResult,
  type DeletionEntry,
  type DeletionPlan,
  type DeletionResult,
  type PlanRow,
  type StoredPlan,
} from '@/types/deletion'
import { type RegistryRecord } from '@/types/registry'

function writable(registry: RegistryRecord): void {
  if (registry.readOnly || registry.provider === 'dockerhub') {
    throw new AppError(403, 'This registry is read only.')
  }
}

function fingerprint(registry: RegistryRecord): string {
  return keyedFingerprint('deletion-plan', registryIdentity(registry))
}

async function batch<T, R>(items: T[], operation: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  let failure: { error: unknown } | undefined

  async function worker(): Promise<void> {
    while (cursor < items.length && !failure) {
      const index = cursor++

      try {
        results[index] = await operation(items[index])
      } catch (error) {
        failure ??= { error }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker))

  if (failure) {
    throw failure.error
  }

  return results
}

export async function deleteManifest(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  actor: string
): Promise<void> {
  writable(registry)

  const encoded = repository.split('/').map(encodeURIComponent).join('/')

  await registryRequest(registry, `/v2/${encoded}/manifests/${encodeURIComponent(digest)}`, {
    method: 'DELETE',
    scope: `repository:${repository}:pull,delete`,
  })

  audit(actor, 'manifest.delete', `${registry.id}/${repository}@${digest}`)
}

export async function previewDeletion(
  registry: RegistryRecord,
  repository: string,
  tags: string[],
  actor: string,
  session: string
): Promise<DeletionPlan> {
  writable(registry)

  const deadline = Date.now() + 60_000
  const manifests = await batch(tags, async (tag) => {
    if (Date.now() >= deadline) {
      throw new AppError(504, 'Manifest preview timed out. Select fewer tags and try again.')
    }

    const image = await imageManifest(registry, repository, tag, true)

    return { tag, digest: image.digest }
  })

  const grouped = new Map<string, DeletionEntry>()

  for (const { tag, digest } of manifests) {
    const entry = grouped.get(digest)

    if (entry) {
      entry.tags.push(tag)
    } else {
      grouped.set(digest, { digest, tags: [tag] })
    }
  }

  const id = randomUUID()
  const expires = Date.now() + 5 * 60_000
  const entries = [...grouped.values()]
  const db = database()

  db.prepare('DELETE FROM deletion_plans WHERE expires <= ?').run(Date.now())
  db.prepare(`
    INSERT INTO deletion_plans (id, username, registry_id, session_id, repository, value, expires)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    actor,
    registry.id,
    session,
    repository,
    JSON.stringify({ fingerprint: fingerprint(registry), entries }),
    expires
  )

  audit(
    actor,
    'manifest.bulk.preview',
    JSON.stringify({
      registryId: registry.id,
      repository,
      tags: tags.length,
      manifests: entries.length,
    })
  )

  return { id, repository, entries, expires }
}

export async function executeDeletion(
  registry: RegistryRecord,
  planId: string,
  confirmation: string,
  actor: string,
  session: string
): Promise<BulkDeletionResult> {
  writable(registry)

  const db = database()
  const row = db
    .prepare(`
      SELECT id, repository, value, expires FROM deletion_plans
      WHERE id = ? AND username = ? AND registry_id = ? AND session_id = ? AND expires > ?
    `)
    .get(planId, actor, registry.id, session, Date.now()) as PlanRow | undefined

  if (!row) {
    throw new AppError(
      400,
      'Deletion preview expired or is unavailable. Preview the selection again.'
    )
  }

  if (confirmation !== row.repository) {
    throw new AppError(400, 'Type the repository name to confirm deletion.')
  }

  const plan = JSON.parse(row.value) as StoredPlan

  if (plan.fingerprint !== fingerprint(registry)) {
    throw new AppError(409, 'The connection changed. Preview the selection again.')
  }

  const consumed = db
    .prepare('DELETE FROM deletion_plans WHERE id = ? AND expires > ? RETURNING id')
    .get(planId, Date.now())

  if (!consumed) {
    throw new AppError(400, 'This deletion preview has already been used or expired.')
  }

  const deadline = Date.now() + 60_000
  const results = await batch(plan.entries, async (entry): Promise<DeletionResult> => {
    try {
      if (Date.now() >= deadline) {
        throw new AppError(504, 'Deletion timed out before this manifest was processed.')
      }

      const current = getRegistry(registry.id)

      if (fingerprint(current) !== plan.fingerprint) {
        throw new AppError(
          409,
          'The connection changed during deletion. Preview the remaining selection again.'
        )
      }

      await deleteManifest(current, row.repository, entry.digest, actor)

      return { ...entry, success: true }
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Manifest deletion failed.'

      audit(actor, 'manifest.delete.failed', `${registry.id}/${row.repository}@${entry.digest}`)

      return { ...entry, success: false, error: message }
    }
  })

  const deleted = results.filter((result) => result.success).length
  const failed = results.length - deleted

  audit(
    actor,
    'manifest.bulk.complete',
    JSON.stringify({
      registryId: registry.id,
      repository: row.repository,
      deleted,
      failed,
    })
  )

  return { results, deleted, failed }
}

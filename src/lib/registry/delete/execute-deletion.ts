import 'server-only'

import { audit } from '@/lib/database/audit'
import { consumePlan, findPlan } from '@/lib/database/deletion'
import { batch } from '@/lib/registry/delete/batch'
import { deleteManifest } from '@/lib/registry/delete/delete-manifest'
import { planKey } from '@/lib/registry/delete/fingerprint'
import { writable } from '@/lib/registry/delete/writable'
import { getRegistry } from '@/lib/registry/store'
import { AppError } from '@/lib/security/error'
import { type BulkDeletionResult, type DeletionResult, type StoredPlan } from '@/types/deletion'
import { type RegistryRecord } from '@/types/registry'

export async function executeDeletion(
  registry: RegistryRecord,
  planId: string,
  confirmation: string,
  actor: string,
  session: string
): Promise<BulkDeletionResult> {
  writable(registry)

  const row = findPlan(planId, actor, registry.id, session)

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

  if (plan.fingerprint !== planKey(registry)) {
    throw new AppError(409, 'The connection changed. Preview the selection again.')
  }

  if (!consumePlan(planId)) {
    throw new AppError(400, 'This deletion preview has already been used or expired.')
  }

  const deadline = Date.now() + 60_000
  const results = await batch(plan.entries, async (entry): Promise<DeletionResult> => {
    try {
      if (Date.now() >= deadline) {
        throw new AppError(504, 'Deletion timed out before this manifest was processed.')
      }

      const current = getRegistry(registry.id)

      if (planKey(current) !== plan.fingerprint) {
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

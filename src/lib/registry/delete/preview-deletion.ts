import 'server-only'

import { randomUUID } from 'node:crypto'

import { audit } from '@/lib/database/audit'
import { insertPlan } from '@/lib/database/deletion'
import { batch } from '@/lib/registry/delete/batch'
import { fingerprint } from '@/lib/registry/delete/fingerprint'
import { writable } from '@/lib/registry/delete/writable'
import { imageManifest } from '@/lib/registry/image'
import { imageDigest } from '@/lib/registry/image-digest'
import { registryListing } from '@/lib/registry/listing'
import { AppError } from '@/lib/security/error'
import { type DeletionEntry, type DeletionPlan } from '@/types/deletion'
import { type RegistryRecord } from '@/types/registry'

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

  const selected = new Set(tags)
  const listing = await registryListing(registry, repository, true)
  const aliases = await batch(
    listing.items.filter((tag) => !selected.has(tag)),
    async (tag) => {
      if (Date.now() >= deadline) {
        throw new AppError(504, 'Tag preview timed out. Narrow the repository before deleting.')
      }

      return { tag, digest: await imageDigest(registry, repository, tag) }
    }
  )

  for (const { tag, digest } of aliases) grouped.get(digest)?.tags.push(tag)

  for (const entry of grouped.values()) entry.tags.sort()

  const id = randomUUID()
  const expires = Date.now() + 5 * 60_000
  const entries = [...grouped.values()]

  insertPlan({
    id,
    username: actor,
    registry_id: registry.id,
    session_id: session,
    repository,
    value: JSON.stringify({ fingerprint: fingerprint(registry), entries }),
    expires,
  })

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

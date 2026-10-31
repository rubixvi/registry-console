import 'server-only'

import { requireRepo } from '@/lib/registry/access'
import { registryCacheIdentity } from '@/lib/registry/identity'
import { privateAccess } from '@/lib/security/access'
import { encryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { fingerprint } from '@/lib/security/fingerprint'
import { type RegistryPage, type RegistryPageInput, type RegistryRecord } from '@/types/registry'

export async function visiblePage(
  registry: RegistryRecord,
  input: RegistryPageInput,
  page: RegistryPage
): Promise<RegistryPage> {
  if (privateAccess() || input.repository) return page

  const items: string[] = []
  const deadline = Date.now() + 30_000

  for (let index = 0; index < page.items.length; index += 4) {
    if (Date.now() >= deadline)
      throw new AppError(504, 'Repository access checks timed out. Retry shortly.')

    const batch = page.items.slice(index, index + 4)
    const results = await Promise.allSettled(
      batch.map((repository) => requireRepo(registry, repository))
    )

    for (const [offset, result] of results.entries()) {
      if (result.status === 'fulfilled') items.push(batch[offset])
    }
  }

  const key = fingerprint('public-catalogue', [registryCacheIdentity(registry), input.n])

  return {
    items,
    next: page.next
      ? encryptSecret(JSON.stringify({ key, last: page.next, expires: Date.now() + 15 * 60_000 }))
      : null,
  }
}

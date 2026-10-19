import 'server-only'

import { publicRepository } from '@/lib/registry/access/public-repository'
import { registryCacheIdentity } from '@/lib/registry/identity'
import { accessState } from '@/lib/security/access/state'
import { AppError } from '@/lib/security/error'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export async function requireRepository(
  registry: RegistryRecord,
  repository: string
): Promise<void> {
  const access = accessState.getStore()

  if (access?.identity.role !== 'viewer') return

  const key = keyedFingerprint('repository-access', [registryCacheIdentity(registry), repository])
  let result = access.repositories.get(key)

  if (!result) {
    result = publicRepository(registry, repository)
    access.repositories.set(key, result)
  }

  if (!(await result)) throw new AppError(404, 'Repository was not found.')
}

import 'server-only'

import { publicRep } from '@/lib/registry/access'
import { registryCacheIdentity } from '@/lib/registry/identity'
import { accessState } from '@/lib/security/access'
import { AppError } from '@/lib/security/error'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord } from '@/types/registry'

export async function requireRepo(registry: RegistryRecord, repository: string): Promise<void> {
  const access = accessState.getStore()

  if (access?.identity.role !== 'viewer') return

  const key = keyedFingerprint('repository-access', [registryCacheIdentity(registry), repository])
  let result = access.repositories.get(key)

  if (!result) {
    result = publicRep(registry, repository)
    access.repositories.set(key, result)
  }

  if (!(await result)) throw new AppError(404, 'Repository was not found.')
}

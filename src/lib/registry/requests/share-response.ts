import 'server-only'

import { cacheGeneration } from '@/lib/registry/cache'
import { registryCacheIdentity } from '@/lib/registry/identity'
import { pending } from '@/lib/registry/requests/state'
import { hasLimits } from '@/lib/security/context'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { type RegistryRecord, type RegistryResponse } from '@/types/registry'

export async function shareResponse(
  registry: RegistryRecord,
  path: string,
  scope: string,
  load: () => Promise<RegistryResponse>
): Promise<RegistryResponse> {
  const key = keyedFingerprint('registry-request', [
    registryCacheIdentity(registry),
    path,
    scope,
    cacheGeneration(),
    hasLimits(),
  ])
  let request = pending.get(key)

  if (!request) {
    request = load()
    pending.set(key, request)
  }

  try {
    const response = await request

    return { text: response.text, headers: new Headers(response.headers) }
  } finally {
    if (pending.get(key) === request) pending.delete(key)
  }
}

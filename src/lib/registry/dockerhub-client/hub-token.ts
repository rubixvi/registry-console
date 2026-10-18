import 'server-only'

import { hubFetch } from '@/lib/registry/dockerhub-client/hub-fetch'
import { loadToken, rememberToken, tokenKey } from '@/lib/registry/token-cache'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { readBounded } from '@/lib/security/request'
import { authSchema } from '@/lib/validation/response/dockerhub'
import { type RegistryRecord } from '@/types/registry'

export async function hubToken(registry: RegistryRecord): Promise<string | null> {
  if (!registry.username && !registry.password) return null

  const key = tokenKey(registry, 'dockerhub-api')

  return loadToken(key, async () => {
    const response = await hubFetch('/v2/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        identifier: registry.username,
        secret: decryptSecret(registry.password),
      }),
    })

    if (!response.ok) {
      await response.body?.cancel()
      throw new AppError(502, 'Docker Hub authentication failed. Check its access token.')
    }

    const body = authSchema.parse(JSON.parse(await readBounded(response, 64 * 1024)))

    rememberToken(key, body.access_token, 60)

    return body.access_token
  })
}

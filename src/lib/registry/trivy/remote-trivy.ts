import 'server-only'

import { env } from '@/lib/config/env'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { readBounded } from '@/lib/security/request'
import { type RegistryRecord } from '@/types/registry'

export async function remoteTrivy(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  platform: string,
  timeout: number
): Promise<unknown> {
  const config = env()

  if (!/^[a-f0-9]{64}$/i.test(config.TRIVY_RUNNER_TOKEN)) {
    throw new AppError(503, 'Configure a scanner worker token before scanning.')
  }

  const response = await fetch(new URL('/scan', config.TRIVY_RUNNER_URL), {
    method: 'POST',
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout + 5000),
    headers: {
      Authorization: `Bearer ${config.TRIVY_RUNNER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      origin: registry.url,
      repository,
      digest,
      platform,
      provider: registry.provider === 'dockerhub' ? 'dockerhub' : 'distribution',
      username: registry.username,
      password: decryptSecret(registry.password),
      timeout: Math.floor(timeout),
    }),
  })

  if (!response.ok) {
    await response.body?.cancel()
    throw new AppError(
      response.status === 503 ? 503 : 502,
      'The isolated scanner could not complete this scan.'
    )
  }

  try {
    return JSON.parse(await readBounded(response, 16 * 1024 * 1024))
  } catch {
    throw new AppError(502, 'The isolated scanner returned an invalid report.')
  }
}

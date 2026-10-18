import 'server-only'

import { createHash } from 'node:crypto'

import { registryRequest } from '@/lib/registry/client'
import { AppError } from '@/lib/security/error'
import { type ImageManifest } from '@/types/image'
import { type RegistryRecord } from '@/types/registry'

export async function imageConfiguration(
  registry: RegistryRecord,
  repository: string,
  manifest: ImageManifest,
  refresh: boolean
): Promise<unknown> {
  if (!manifest.config) {
    return null
  }

  const encoded = repository.split('/').map(encodeURIComponent).join('/')

  const blob = await registryRequest(registry, `/v2/${encoded}/blobs/${manifest.config.digest}`, {
    scope: `repository:${repository}:pull`,
    cache: refresh ? 'reload' : 'default',
  })

  const digest = `sha256:${createHash('sha256').update(blob.text).digest('hex')}`

  if (digest !== manifest.config.digest) {
    throw new AppError(502, 'Image configuration digest verification failed.')
  }

  try {
    return JSON.parse(blob.text)
  } catch {
    throw new AppError(502, 'Registry returned invalid image configuration.')
  }
}

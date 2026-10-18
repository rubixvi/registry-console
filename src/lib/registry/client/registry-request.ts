import 'server-only'

import { validateUrl } from '@/lib/registry/allowlist'
import {
  cachedResponse,
  cacheGeneration,
  invalidateRegistry,
  invalidateResponse,
  rememberResponse,
} from '@/lib/registry/cache'
import { fetchRegistry } from '@/lib/registry/client/fetch-registry'
import { shareResponse } from '@/lib/registry/requests'
import { AppError } from '@/lib/security/error'
import { type RegistryOptions, type RegistryRecord, type RegistryResponse } from '@/types/registry'

export async function registryRequest(
  registry: RegistryRecord,
  path: string,
  options: RegistryOptions = {}
): Promise<RegistryResponse> {
  const origin = validateUrl(registry.url, registry.provider)

  if (!path.startsWith('/v2/') || new URL(path, origin).origin !== origin) {
    throw new AppError(400, 'Invalid registry path.')
  }

  const deletion = options.method === 'DELETE'
  const readable = !options.method || options.method === 'GET'

  if (deletion) {
    invalidateRegistry(registry.id)
  } else if (readable && options.cache === 'reload') {
    invalidateResponse(registry, path, options.scope)
  }

  try {
    if (readable && options.cache !== 'reload') {
      const cached = cachedResponse(registry, path, options.scope)

      if (cached) return cached
    }

    const generation = cacheGeneration()
    const response = deletion
      ? await fetchRegistry(registry, path, options)
      : await shareResponse(
          registry,
          path,
          `${options.method ?? 'GET'}:${options.scope ?? ''}`,
          () => fetchRegistry(registry, path, options)
        )

    if (readable) {
      rememberResponse(registry, path, options.scope, response, generation)
    }

    return response
  } finally {
    if (deletion) {
      invalidateRegistry(registry.id)
    }
  }
}

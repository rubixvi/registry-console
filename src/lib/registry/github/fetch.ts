import 'server-only'

import { GITHUB_API } from '@/lib/registry/github/constants'
import { checkBackoff, limitRegistry } from '@/lib/registry/throttle'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { readBounded } from '@/lib/security/request'
import { type RegistryRecord, type RegistryResponse } from '@/types/registry'

export async function githubFetch(
  registry: RegistryRecord,
  path: string,
  method: 'GET' | 'DELETE'
): Promise<RegistryResponse> {
  checkBackoff(GITHUB_API)

  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${decryptSecret(registry.password)}`,
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'Registry-Console',
    },
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000),
  })

  if (!response.ok) {
    await response.body?.cancel()

    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' ||
          response.headers.has('retry-after')))
    ) {
      const headers = new Headers(response.headers)
      const reset = Number(headers.get('x-ratelimit-reset'))

      if (!headers.has('retry-after') && Number.isFinite(reset) && reset > 0) {
        headers.set('retry-after', String(Math.max(1, Math.ceil(reset - Date.now() / 1000))))
      }

      throw limitRegistry(GITHUB_API, headers)
    }

    if (response.status === 404)
      throw new AppError(404, 'GitHub package or namespace was not found.')

    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        403,
        method === 'DELETE'
          ? 'GitHub denied deletion. Check package admin access, delete:packages scope and GitHub deletion restrictions.'
          : 'GitHub denied access. Check the package token, read:packages scope and organisation SSO authorisation.'
      )
    }

    if (response.status === 503 || response.status === 504) {
      throw new AppError(response.status, 'GitHub is temporarily unavailable. Retry shortly.', 1)
    }

    throw new AppError(502, 'GitHub package request failed or returned a blocked redirect.')
  }

  return { text: await readBounded(response, 2 * 1024 * 1024), headers: response.headers }
}

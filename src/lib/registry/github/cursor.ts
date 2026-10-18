import 'server-only'

import { GITHUB_API } from '@/lib/registry/github/constants'
import { AppError } from '@/lib/security/error'

export function githubCursor(
  link: string | null,
  path: string,
  page: number,
  size: number
): string | null {
  if (!link) return null

  const match = link.match(/<([^>]+)>;\s*rel="?next"?/i)

  if (!match) return null

  const url = new URL(match[1], GITHUB_API)

  if (
    url.origin !== GITHUB_API ||
    url.pathname !== path ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.get('page') !== String(page + 1) ||
    url.searchParams.get('per_page') !== String(size)
  ) {
    throw new AppError(502, 'GitHub returned an unsafe pagination link.')
  }

  return String(page + 1)
}

import { AppError } from '@/lib/security/error'

const MAX_CURSOR_LENGTH = 255

export function nextCursor(
  link: string | null,
  origin: string,
  expectedPath: string
): string | null {
  if (!link) return null

  const match = link.match(/<([^>]+)>;\s*rel="?next"?/i)

  if (!match) return null

  let url: URL

  try {
    url = new URL(match[1], origin)
  } catch {
    throw new AppError(502, 'Registry returned an invalid pagination link.')
  }

  const hasCredentials = Boolean(url.username || url.password)
  const hasExpectedOrigin = url.origin === origin
  const hasExpectedPath = url.pathname === expectedPath

  if (hasCredentials || !hasExpectedOrigin || !hasExpectedPath) {
    throw new AppError(502, 'Registry returned an unsafe pagination link.')
  }

  const cursor = url.searchParams.get('last')

  if (!cursor || cursor.length > MAX_CURSOR_LENGTH) {
    return null
  }

  return cursor
}

import { randomBytes } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString('base64')

  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
  ].join('; ')

  const headers = new Headers(request.headers)

  headers.set(
    'x-registry-refresh',
    /(?:^|,)\s*no-cache\b/i.test(request.headers.get('cache-control') ?? '') ? '1' : '0'
  )
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', policy)

  const response = NextResponse.next({ request: { headers } })

  response.headers.set('Content-Security-Policy', policy)
  response.headers.set('Cache-Control', 'no-store')

  if (process.env.APP_ORIGIN?.startsWith('https://')) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000')
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

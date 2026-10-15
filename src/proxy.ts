import { randomBytes } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString('base64')
  const isDevelopment = process.env.NODE_ENV === 'development'

  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]

  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'")
  }

  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
  ].join('; ')

  const requestHeaders = new Headers(request.headers)

  requestHeaders.set(
    'x-registry-refresh',
    /(?:^|,)\s*no-cache\b/i.test(request.headers.get('cache-control') ?? '') ? '1' : '0'
  )

  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

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

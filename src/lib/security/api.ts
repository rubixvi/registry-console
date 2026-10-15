import 'server-only'

import { type NextRequest, NextResponse } from 'next/server'

import { auditAuthFailure } from '@/lib/auth/audit'
import { getIdentity } from '@/lib/auth/session'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { requireOrigin } from '@/lib/security/request'
import { type Identity, type Role } from '@/types/auth'

type Context = {
  params: Promise<Record<string, string>>
}

type Handler = (request: NextRequest, context: Context, identity: Identity) => Promise<NextResponse>

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const DEFAULT_ERROR = 'Operation failed. Check the server configuration or registry connection.'

export function api(handler: Handler, role?: Role) {
  return async (request: NextRequest, context: Context): Promise<NextResponse> => {
    let identity: Identity | null = null

    try {
      identity = await getIdentity()

      if (!identity) {
        throw new AppError(401, 'Sign in to continue.')
      }

      if (role === 'admin' && identity.role !== 'admin') {
        throw new AppError(403, 'Administrator access required.')
      }

      rateLimit(`api:${identity.username}`, 240, 60_000)

      if (!SAFE_METHODS.has(request.method)) {
        requireOrigin(request)
      }

      const response = await handler(request, context, identity)

      response.headers.set('Cache-Control', 'no-store')

      return response
    } catch (error) {
      const path = new URL(request.url).pathname

      if (path.startsWith('/api/account/')) {
        auditAuthFailure(identity?.username ?? 'anonymous', 'security.request.failed', error, path)
      }

      return apiError(error)
    }
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const headers = new Headers({ 'Cache-Control': 'no-store' })

    if (error.retryAfter !== undefined || error.status === 429) {
      headers.set('Retry-After', String(error.retryAfter ?? 60))
    }

    return NextResponse.json({ error: error.message }, { status: error.status, headers })
  }

  const errorName = error instanceof Error ? error.name : 'UnknownError'

  console.error('Operation failed', errorName)

  return NextResponse.json(
    { error: DEFAULT_ERROR },
    {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}

import 'server-only'

import { type NextRequest, type NextResponse } from 'next/server'

import { auditRequest } from '@/lib/audit'
import { auditAuth } from '@/lib/auth/audit'
import { getIdentity } from '@/lib/auth/session'
import { hasRole, withIdentity } from '@/lib/security/access'
import { apiError } from '@/lib/security/api'
import { withLimits } from '@/lib/security/context'
import { AppError } from '@/lib/security/error'
import { requireOrigin } from '@/lib/security/request'
import { type Identity, type Role } from '@/types/auth'

type Context = {
  params: Promise<Record<string, string>>
}

type Handler = (request: NextRequest, context: Context, identity: Identity) => Promise<NextResponse>

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function apiRequest(handler: Handler, role?: Role) {
  return auditRequest(async (request: NextRequest, context: Context): Promise<NextResponse> => {
    let identity: Identity | null = null

    try {
      identity = await getIdentity()

      if (!identity) {
        throw new AppError(401, 'Sign in to continue.')
      }

      if (role && !hasRole(identity.role, role)) {
        throw new AppError(403, `${role === 'admin' ? 'Admin' : 'Member'} access required.`)
      }

      const current = identity

      return await withIdentity(current, () =>
        withLimits(current.role !== 'admin', async () => {
          if (!SAFE_METHODS.has(request.method)) {
            requireOrigin(request)
          }

          const response = await handler(request, context, current)

          response.headers.set('Cache-Control', 'no-store')

          return response
        })
      )
    } catch (error) {
      const path = new URL(request.url).pathname

      if (path.startsWith('/api/account/')) {
        auditAuth(identity?.username ?? 'anonymous', 'security.request.failed', error, path)
      }

      return apiError(error)
    }
  })
}

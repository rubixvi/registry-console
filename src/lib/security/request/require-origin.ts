import 'server-only'

import { env } from '@/lib/config/env'
import { AppError } from '@/lib/security/error'

export function requireOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')

  if (origin !== env().APP_ORIGIN || fetchSite === 'cross-site') {
    throw new AppError(403, 'Request origin rejected.')
  }
}

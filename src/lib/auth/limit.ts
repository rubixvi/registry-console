import 'server-only'

import { isIP } from 'node:net'

import { env } from '@/lib/config/env'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'

const CAPACITY_WINDOW_MS = 1000
const MAX_REQUESTS_PER_WINDOW = 120

let windowExpires = 0
let requests = 0

export function limitSignIn(request: Request, method: string): void {
  const now = Date.now()

  if (now >= windowExpires) {
    windowExpires = now + CAPACITY_WINDOW_MS
    requests = 0
  }

  requests++

  if (requests > MAX_REQUESTS_PER_WINDOW) {
    throw new AppError(503, 'Sign-in capacity reached. Please retry shortly.', 1)
  }

  if (env().TRUST_PROXY !== 'true') {
    return
  }

  const source = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()

  if (!source || !isIP(source)) {
    throw new AppError(400, 'A valid forwarded client address is required.')
  }

  rateLimit(`${method}-source:${source}`, 30, 15 * 60_000)
}

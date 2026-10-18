import { HttpError } from '@/lib/http/error'

export function retryDelay(error: unknown, count: number): number | undefined {
  if (!(error instanceof HttpError) || ![429, 503, 504].includes(error.status) || count > 3) {
    return undefined
  }

  return Math.max(1000 * 2 ** Math.max(0, count - 1), error.retryAfter * 1000)
}

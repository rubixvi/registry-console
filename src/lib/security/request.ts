import 'server-only'

import { type z } from 'zod'

import { env } from '@/lib/config/env'
import { AppError } from '@/lib/security/error'

const MAX_JSON_BYTES = 16 * 1024
const BODY_TIMEOUT_MS = 15_000

export function requireOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')

  if (origin !== env().APP_ORIGIN || fetchSite === 'cross-site') {
    throw new AppError(403, 'Request origin rejected.')
  }
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  max = MAX_JSON_BYTES
): Promise<T> {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()

  if (contentType !== 'application/json') {
    throw new AppError(415, 'JSON is required.')
  }

  const body = await readBounded(request, max)

  try {
    return schema.parse(JSON.parse(body))
  } catch {
    throw new AppError(400, 'Invalid request. Check the supplied fields.')
  }
}

export async function readBounded(
  message: Request | Response,
  max: number,
  timeoutMs = BODY_TIMEOUT_MS
): Promise<string> {
  return (await readBytes(message, max, timeoutMs)).toString('utf8')
}

export async function readBytes(
  message: Request | Response,
  max: number,
  timeoutMs = BODY_TIMEOUT_MS
): Promise<Buffer> {
  const content = Number(message.headers.get('content-length'))

  if (content > max) {
    await message.body?.cancel()
    throw new AppError(413, 'Response or request too large.')
  }

  const reader = message.body?.getReader()

  if (!reader) return Buffer.alloc(0)

  const chunks: Uint8Array[] = []
  let size = 0
  let timedOut = false

  const deadline = setTimeout(() => {
    timedOut = true
    void reader.cancel().catch(() => undefined)
  }, timeoutMs)

  try {
    while (true) {
      const { value, done } = await reader.read()

      if (timedOut) {
        const status = message instanceof Request ? 408 : 504
        throw new AppError(status, 'Body read timed out.')
      }

      if (done) break

      size += value.byteLength

      if (size > max) {
        await reader.cancel()
        throw new AppError(413, 'Response or request too large.')
      }

      chunks.push(value)
    }

    return Buffer.concat(chunks)
  } finally {
    clearTimeout(deadline)
    reader.releaseLock()
  }
}

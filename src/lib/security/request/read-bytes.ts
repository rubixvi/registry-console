import 'server-only'

import { AppError } from '@/lib/security/error'
import { BODY_TIMEOUT_MS } from '@/lib/security/request'

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

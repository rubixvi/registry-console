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
    void message.body?.cancel().catch(() => undefined)
    throw new AppError(413, 'Response or request too large.')
  }

  const reader = message.body?.getReader()

  if (!reader) return Buffer.alloc(0)

  const chunks: Uint8Array[] = []
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const status = message instanceof Request ? 408 : 504

      reject(new AppError(status, 'Body read timed out.'))
      void reader.cancel().catch(() => undefined)
    }, timeoutMs)
  })

  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline])

      if (done) break

      size += value.byteLength

      if (size > max) {
        void reader.cancel().catch(() => undefined)
        throw new AppError(413, 'Response or request too large.')
      }

      chunks.push(value)
    }

    return Buffer.concat(chunks, size)
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

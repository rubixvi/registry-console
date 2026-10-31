import 'server-only'

import { type z } from 'zod'

import { AppError } from '@/lib/security/error'
import { MAX_JSON_BYTES, readBounded } from '@/lib/security/request'

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

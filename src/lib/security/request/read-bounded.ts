import 'server-only'

import { BODY_TIMEOUT_MS, readBytes } from '@/lib/security/request'

export async function readBounded(
  message: Request | Response,
  max: number,
  timeoutMs = BODY_TIMEOUT_MS
): Promise<string> {
  return (await readBytes(message, max, timeoutMs)).toString('utf8')
}

import 'server-only'

import { env } from '@/lib/config/env'
import { keysSchema } from '@/lib/validation/keys'

export function secretKeys(): Map<string, Buffer> {
  const config = env()
  const previous = keysSchema.parse(JSON.parse(config.ENCRYPTION_KEYS_JSON))

  if (
    previous[config.ENCRYPTION_KEY_ID] &&
    previous[config.ENCRYPTION_KEY_ID].toLowerCase() !== config.ENCRYPTION_KEY.toLowerCase()
  ) {
    throw new Error('The active encryption key ID must refer to the active key.')
  }

  return new Map(
    Object.entries({ ...previous, [config.ENCRYPTION_KEY_ID]: config.ENCRYPTION_KEY }).map(
      ([id, key]) => [id, Buffer.from(key, 'hex')]
    )
  )
}

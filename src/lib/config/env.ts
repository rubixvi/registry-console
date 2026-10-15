import 'server-only'

import { appOrigin } from '@/lib/config/origin'
import { envSchema } from '@/lib/validation/env'
import { type ServerEnv } from '@/types/config'

let cached: ServerEnv | undefined

export function env(): ServerEnv {
  if (cached) return cached

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ')

    throw new Error(`Invalid server configuration: ${fields}`)
  }

  const production = process.env.NODE_ENV === 'production'
  const origin = appOrigin(result.data.APP_ORIGIN, production)

  cached = {
    ...result.data,
    APP_ORIGIN: origin,
  }

  return cached
}

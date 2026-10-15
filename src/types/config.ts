import { type z } from 'zod'

import { type envSchema } from '@/lib/validation/env'

export type ServerEnv = z.infer<typeof envSchema>

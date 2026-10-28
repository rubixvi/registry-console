import { z } from 'zod'

export const keyName = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/)

export const keysSchema = z
  .record(keyName, z.string().regex(/^[a-f0-9]{64}$/i))
  .refine((keys) => Object.keys(keys).length <= 16, 'Keep at most 16 decryption keys.')

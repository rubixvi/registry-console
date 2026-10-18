import { z } from 'zod'

export const pageSchema = z.object({
  next: z.string().nullable(),
  results: z
    .array(
      z.object({
        name: z
          .string()
          .regex(/^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*$/)
          .max(255),
      })
    )
    .max(100),
})

export const authSchema = z.object({
  access_token: z
    .string()
    .min(1)
    .max(32_768)
    .regex(/^[^\r\n]+$/),
})

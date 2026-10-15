import { z } from 'zod'

export const imageHistorySchema = z
  .object({
    history: z
      .array(
        z
          .object({
            created: z.string().optional(),
            created_by: z.string().optional(),
            author: z.string().optional(),
            comment: z.string().optional(),
            empty_layer: z.boolean().optional(),
          })
          .loose()
      )
      .max(10_000)
      .optional(),
  })
  .loose()

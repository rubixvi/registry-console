import { z } from 'zod'

const historyEntry = z
  .object({
    created: z.string().optional(),
    created_by: z.string().optional(),
    author: z.string().optional(),
    comment: z.string().optional(),
    empty_layer: z.boolean().optional(),
  })
  .loose()

export const imageHistorySchema = z
  .object({
    history: z.array(historyEntry).max(10_000).optional(),
  })
  .loose()

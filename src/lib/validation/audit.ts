import { z } from 'zod'

const dateFilter = z.union([z.literal(''), z.iso.date()]).default('')

export const auditInput = z
  .object({
    actor: z.string().trim().max(64).default(''),
    action: z.string().trim().max(128).default(''),
    query: z.string().trim().max(256).default(''),
    from: dateFilter,
    to: dateFilter,
    before: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    n: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The start date must be before the end date.',
  })

import { z } from 'zod'

import { referenceName, repositoryName } from '@/lib/validation/registry'

export const tagsSchema = z.object({
  tags: z.array(referenceName).max(10_000).nullable(),
})

export const catalogueSchema = z.object({
  repositories: z.array(repositoryName).max(10_000),
})

export const tokenSchema = z.object({
  token: z.string().max(16_384).optional(),
  access_token: z.string().max(16_384).optional(),
  expires_in: z.number().int().positive().optional(),
})

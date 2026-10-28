import { z } from 'zod'

import { referenceName, repositoryName } from '@/lib/validation/registry'

const token = z.string().max(16_384).optional()

export const tagsSchema = z.object({
  tags: z.array(referenceName).max(10_000).nullable(),
})

export const catalogueSchema = z.object({
  repositories: z.array(repositoryName).max(10_000),
})

export const tokenSchema = z.object({
  token,
  access_token: token,
  expires_in: z.number().int().positive().optional(),
})

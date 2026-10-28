import { z } from 'zod'

import { digestName, referenceName, repositoryName } from '@/lib/validation/registry'

const pageCount = z.number().int().min(0).max(200).default(0)

export const scanQuery = z
  .object({
    repository: repositoryName,
    digest: digestName,
  })
  .strict()

export const scanInput = scanQuery.extend({
  override: z.boolean().default(false),
})

export const cursorSchema = z.object({
  catalogue: z.string().max(255).nullable().default(''),
  repositories: z.array(repositoryName).max(100).default([]),
  repository: z.union([repositoryName, z.literal('')]).default(''),
  cursor: z.string().max(255).nullable().default(''),
  tags: z.array(referenceName).max(100).default([]),
  pages: pageCount,
  tagPages: pageCount,
})

import { z } from 'zod'

import { pullUrlSchema } from '@/lib/validation/url'
import { TAG_ORDERS } from '@/utils/sort-tags'

export const repositoryName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*)*$/)

export const referenceName = z
  .string()
  .max(128)
  .regex(/^(?:[\w][\w.-]{0,127}|sha256:[a-f0-9]{64})$/)

export const digestName = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const registryInput = z
  .object({
    name: z.string().trim().min(1).max(64),
    url: z.url().max(2048),
    pullUrl: pullUrlSchema.default(''),
    username: z
      .string()
      .max(128)
      .refine((value) => !value.includes(':') && !/[\r\n]/.test(value)),
    password: z.string().max(4096),
    readOnly: z.boolean(),
    provider: z.enum(['distribution', 'dockerhub', 'github']).default('distribution'),
    namespace: z.string().trim().max(64).default(''),
  })
  .strict()

export const pageInput = z.object({
  last: z.string().max(2048).default(''),
  n: z.coerce.number().int().min(1).max(100).default(100),
})

export const architectureName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/)

export const browseInput = z
  .object({
    repository: repositoryName.optional(),
    architecture: architectureName.optional(),
    query: z.string().max(128).default(''),
    order: z.enum(TAG_ORDERS).optional(),
  })
  .strict()

export const imageInput = z.object({
  repository: repositoryName,
  reference: referenceName,
})

export const deleteInput = z
  .object({
    repository: repositoryName,
    digest: digestName,
    confirmation: repositoryName,
  })
  .strict()
  .refine((value) => value.repository === value.confirmation)

export const tagsInput = pageInput.extend({
  repository: repositoryName,
})

export const bulkPreviewInput = z
  .object({
    repository: repositoryName,
    tags: z
      .array(referenceName)
      .min(1)
      .max(100)
      .refine((tags) => new Set(tags).size === tags.length),
  })
  .strict()

export const bulkDeleteInput = z
  .object({
    planId: z.uuid(),
    confirmation: repositoryName,
  })
  .strict()

export const searchSchema = z
  .object({
    query: z.string().trim().max(128).default(''),
    registry: z.string().max(128).optional(),
    architecture: architectureName.optional(),
  })
  .strict()

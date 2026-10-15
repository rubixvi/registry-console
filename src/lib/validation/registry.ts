import { z } from 'zod'

import { pullUrlSchema } from '@/lib/validation/url'

export const repositoryName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*)*$/)

export const referenceName = z
  .string()
  .max(128)
  .regex(/^(?:[\w][\w.-]{0,127}|sha256:[a-f0-9]{64})$/)

export const tagsSchema = z.object({
  tags: z.array(referenceName).max(10_000).nullable(),
})

export const catalogueSchema = z.object({
  repositories: z.array(repositoryName).max(10_000),
})

export const digestName = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export const registryInput = z
  .object({
    name: z.string().trim().min(1).max(64),
    url: z.url().max(2048),
    pullUrl: pullUrlSchema.default(''),
    username: z
      .string()
      .max(128)
      .refine((v) => !v.includes(':') && !/[\r\n]/.test(v)),
    password: z.string().max(4096),
    readOnly: z.boolean(),
  })
  .strict()

export const pageInput = z.object({
  last: z.string().max(255).default(''),
  n: z.coerce.number().int().min(1).max(100).default(100),
})

export const browseInput = z.object({ repository: repositoryName.optional() }).strict()

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
  .refine((v) => v.repository === v.confirmation)

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

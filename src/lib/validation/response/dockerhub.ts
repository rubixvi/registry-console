import { z } from 'zod'

import { digestName, referenceName } from '@/lib/validation/registry'

export const repositorySchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*$/)
    .max(255),
  namespace: z.string().max(64).optional(),
  is_private: z.boolean().optional(),
})

export const tagSchema = z.object({
  name: referenceName,
  digest: digestName.nullish(),
  tag_last_pushed: z.string().max(64).nullish(),
  last_updated: z.string().max(64).nullish(),
  content_type: z.string().max(128).nullish(),
  images: z
    .array(
      z.object({
        os: z.string().max(64).nullish(),
        architecture: z.string().max(64).nullish(),
      })
    )
    .max(100)
    .nullish(),
})

export const tagPageSchema = z.object({
  next: z.string().nullable(),
  results: z.array(tagSchema).max(100),
})

export const pageSchema = z.object({
  next: z.string().nullable(),
  results: z.array(repositorySchema).max(100),
})

export const authSchema = z.object({
  access_token: z
    .string()
    .min(1)
    .max(32_768)
    .regex(/^[^\r\n]+$/),
})

import { z } from 'zod'

import { digestName } from '@/lib/validation/registry'

export const descriptorSchema = z
  .object({
    digest: digestName,
    size: z.number().int().nonnegative(),
    mediaType: z.string().optional(),
    platform: z
      .object({
        os: z.string(),
        architecture: z.string(),
        variant: z.string().optional(),
      })
      .optional(),
  })
  .loose()

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    mediaType: z.string().optional(),
    config: descriptorSchema.optional(),
    layers: z.array(descriptorSchema).max(1000).optional(),
    manifests: z.array(descriptorSchema).max(1000).optional(),
  })
  .loose()

import { z } from 'zod'

import { digestName } from '@/lib/validation/registry'

const platform = z.object({
  os: z.string(),
  architecture: z.string(),
  variant: z.string().optional(),
})

export const descriptorSchema = z
  .object({
    digest: digestName,
    size: z.number().int().nonnegative(),
    mediaType: z.string().optional(),
    artifactType: z.string().optional(),
    platform: platform.optional(),
  })
  .loose()

const descriptors = z.array(descriptorSchema).max(1000)

export const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    mediaType: z.string().optional(),
    artifactType: z.string().optional(),
    config: descriptorSchema.optional(),
    layers: descriptors.optional(),
    manifests: descriptors.optional(),
  })
  .loose()

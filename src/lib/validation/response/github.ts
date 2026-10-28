import { z } from 'zod'

import { digestName, repositoryName } from '@/lib/validation/registry'

const owner = z.object({
  login: z.string().min(1).max(39),
})

export const githubPackage = z.object({
  name: repositoryName,
  owner,
  visibility: z.enum(['public', 'private', 'internal']),
})

export const githubOwner = owner.extend({
  type: z.enum(['User', 'Organization']),
})

export const githubPackages = z
  .array(
    z.object({
      name: repositoryName,
      package_type: z.literal('container'),
      owner,
    })
  )
  .max(100)

export const githubVersions = z
  .array(
    z.object({
      id: z.number().int().positive().safe(),
      name: digestName,
    })
  )
  .max(100)

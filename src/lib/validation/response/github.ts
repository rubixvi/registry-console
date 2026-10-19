import { z } from 'zod'

import { digestName, repositoryName } from '@/lib/validation/registry'

export const githubPackage = z.object({
  name: repositoryName,
  owner: z.object({ login: z.string().min(1).max(39) }),
  visibility: z.enum(['public', 'private', 'internal']),
})

export const githubOwner = z.object({
  login: z.string().min(1).max(39),
  type: z.enum(['User', 'Organization']),
})

export const githubPackages = z
  .array(
    z.object({
      name: repositoryName,
      package_type: z.literal('container'),
      owner: z.object({ login: z.string().min(1).max(39) }),
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

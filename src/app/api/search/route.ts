import { NextResponse } from 'next/server'

import { searchRegistry } from '@/lib/registry/search'
import { getRegistries, getRegistry } from '@/lib/registry/store'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { searchSchema } from '@/lib/validation/registry'

export const GET = api(async (request, _context, identity) => {
  rateLimit(`workspace-search:${identity.username}`, 6, 60_000)

  const parsed = searchSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))

  if (!parsed.success) {
    throw new AppError(400, 'Invalid search filters.')
  }

  const { query, architecture, registry: registryId } = parsed.data
  const registries = getRegistries().filter((registry) => !registryId || registry.id === registryId)

  if (architecture && registries.length > 10) {
    throw new AppError(400, 'Select a registry before searching across more than ten connections.')
  }

  const results: { registryId: string; registryName: string; repository: string }[] = []
  const failures: { registryName: string; message: string }[] = []
  const deadline = Date.now() + 60_000

  for (const registry of registries) {
    if (Date.now() >= deadline) {
      throw new AppError(504, 'Workspace search timed out. Select a registry to narrow the search.')
    }

    try {
      const result = await searchRegistry(getRegistry(registry.id), { query, architecture })

      for (const repository of result.items) {
        results.push({ registryId: registry.id, registryName: registry.name, repository })
      }

      if (results.length > 10_000) {
        throw new AppError(413, 'Too many search results. Narrow the repository search.')
      }
    } catch (error) {
      if (error instanceof AppError && [413, 504].includes(error.status)) {
        throw error
      }

      failures.push({
        registryName: registry.name,
        message: error instanceof AppError ? error.message : 'Search is unavailable.',
      })
    }
  }

  return NextResponse.json({ results, failures })
})

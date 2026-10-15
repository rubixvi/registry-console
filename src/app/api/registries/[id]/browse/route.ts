import { NextResponse } from 'next/server'

import { registryListing } from '@/lib/registry/listing'
import { getRegistry } from '@/lib/registry/store'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { browseInput } from '@/lib/validation/registry'

export const GET = api(async (request, context, identity) => {
  const { id } = await context.params
  const parsed = browseInput.safeParse(Object.fromEntries(request.nextUrl.searchParams))

  if (!parsed.success) throw new AppError(400, 'Invalid repository filter.')

  const registry = getRegistry(id)
  const refresh = request.headers.get('x-registry-refresh') === '1'

  rateLimit(`registry-browse:${identity.username}`, 30, 60_000)

  return NextResponse.json(await registryListing(registry, parsed.data.repository, refresh))
})

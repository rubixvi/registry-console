import { NextResponse } from 'next/server'

import { searchRegistry } from '@/lib/registry/search'
import { getRegistry } from '@/lib/registry/store'
import { apiRequest } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { browseInput } from '@/lib/validation/registry'

export const GET = apiRequest(async (request, context) => {
  const { id } = await context.params
  const parsed = browseInput.safeParse(Object.fromEntries(request.nextUrl.searchParams))

  if (!parsed.success) throw new AppError(400, 'Invalid repository filter.')

  const registry = getRegistry(id)
  const refresh =
    request.headers.get('x-registry-refresh') === '1' ||
    request.headers.get('cache-control')?.toLowerCase().includes('no-cache') === true

  return NextResponse.json(await searchRegistry(registry, parsed.data, refresh))
})

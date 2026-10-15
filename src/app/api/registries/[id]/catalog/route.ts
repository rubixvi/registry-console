import { NextResponse } from 'next/server'

import { registryPage } from '@/lib/registry/catalog'
import { getRegistry } from '@/lib/registry/store'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { pageInput } from '@/lib/validation/registry'

export const GET = api(async (request, context) => {
  const { id } = await context.params
  const params = new URL(request.url).searchParams
  const parsed = pageInput.safeParse(Object.fromEntries(params))

  if (!parsed.success) {
    throw new AppError(400, 'Invalid pagination parameters.')
  }

  const registry = getRegistry(id)
  const page = await registryPage(registry, parsed.data)

  return NextResponse.json(page)
})

import { NextResponse } from 'next/server'

import { registryPage } from '@/lib/registry/catalog'
import { getRegistry } from '@/lib/registry/store'
import { apiRequest } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { tagsInput } from '@/lib/validation/registry'

export const GET = apiRequest(async (request, context) => {
  const { id } = await context.params
  const params = new URL(request.url).searchParams
  const parsed = tagsInput.safeParse(Object.fromEntries(params))

  if (!parsed.success) {
    throw new AppError(400, 'Invalid repository or pagination parameters.')
  }

  const registry = getRegistry(id)
  const page = await registryPage(registry, parsed.data)

  return NextResponse.json(page)
})

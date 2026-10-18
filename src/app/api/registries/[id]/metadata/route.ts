import { NextResponse } from 'next/server'

import { imageMetadata } from '@/lib/registry/metadata'
import { getRegistry } from '@/lib/registry/store'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { imageInput } from '@/lib/validation/registry'

export const GET = api(async (request, context) => {
  const { id } = await context.params
  const params = new URL(request.url).searchParams
  const parsed = imageInput.safeParse(Object.fromEntries(params))

  if (!parsed.success) {
    throw new AppError(400, 'Invalid image reference.')
  }

  const registry = getRegistry(id)
  const { repository, reference } = parsed.data
  const refresh = request.headers.get('x-registry-refresh') === '1'

  return NextResponse.json(await imageMetadata(registry, repository, reference, refresh))
})

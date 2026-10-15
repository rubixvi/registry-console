import { NextResponse } from 'next/server'

import { registryRequest } from '@/lib/registry/client'
import { getRegistry } from '@/lib/registry/store'
import { api } from '@/lib/security/api'

export const GET = api(async (_request, context) => {
  const { id } = await context.params
  const registry = getRegistry(id)

  await registryRequest(registry, '/v2/')

  return NextResponse.json({ connected: true })
})

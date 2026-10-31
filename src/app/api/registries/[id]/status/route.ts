import { NextResponse } from 'next/server'

import { registryPage } from '@/lib/registry/catalog'
import { registryRequest } from '@/lib/registry/client'
import { getRegistry } from '@/lib/registry/store'
import { apiRequest } from '@/lib/security/api'

export const GET = apiRequest(async (_request, context) => {
  const { id } = await context.params
  const registry = getRegistry(id)

  await registryRequest(registry, '/v2/')

  if (registry.provider === 'dockerhub') {
    await registryPage(registry, { last: '', n: 1 }, true)
  }

  return NextResponse.json({ connected: true })
})

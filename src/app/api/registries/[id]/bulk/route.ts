import { NextResponse } from 'next/server'

import { sessionId } from '@/lib/auth/requests'
import { executeDeletion, previewDeletion } from '@/lib/registry/delete'
import { getRegistry } from '@/lib/registry/store'
import { api } from '@/lib/security/api'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson } from '@/lib/security/request'
import { bulkDeleteInput, bulkPreviewInput } from '@/lib/validation/registry'

export const POST = api(async (request, context, identity) => {
  const { id } = await context.params
  const registry = getRegistry(id)
  const { repository, tags } = await readJson(request, bulkPreviewInput)

  rateLimit(`bulk-preview:${identity.username}`, 10, 60_000)

  const plan = await previewDeletion(
    registry,
    repository,
    tags,
    identity.username,
    sessionId(request)
  )

  return NextResponse.json(plan)
}, 'admin')

export const DELETE = api(async (request, context, identity) => {
  const { id } = await context.params
  const registry = getRegistry(id)
  const { planId, confirmation } = await readJson(request, bulkDeleteInput)

  rateLimit(`bulk-delete:${identity.username}`, 10, 60_000)

  const result = await executeDeletion(
    registry,
    planId,
    confirmation,
    identity.username,
    sessionId(request)
  )

  return NextResponse.json(result)
}, 'admin')

import { NextResponse } from 'next/server'

import { sessionId } from '@/lib/auth/requests'
import { executeDeletion, previewDeletion } from '@/lib/registry/delete'
import { getRegistry } from '@/lib/registry/store'
import { api } from '@/lib/security/api'
import { readJson } from '@/lib/security/request'
import { bulkDeleteInput, bulkPreviewInput } from '@/lib/validation/registry'

export const POST = api(async (request, context, identity) => {
  const { id } = await context.params
  const registry = getRegistry(id)
  const { repository, tags } = await readJson(request, bulkPreviewInput)

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

  const result = await executeDeletion(
    registry,
    planId,
    confirmation,
    identity.username,
    sessionId(request)
  )

  return NextResponse.json(result)
}, 'admin')

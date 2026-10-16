import { NextResponse } from 'next/server'

import { deleteManifest } from '@/lib/registry/delete'
import { imageDetails } from '@/lib/registry/image'
import { getRegistry } from '@/lib/registry/store'
import { scheduleScan } from '@/lib/registry/trivy'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { readJson } from '@/lib/security/request'
import { deleteInput, imageInput } from '@/lib/validation/registry'

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
  const details = await imageDetails(registry, repository, reference, refresh)

  scheduleScan(registry, repository, details.digest)

  return NextResponse.json(details)
})

export const DELETE = api(async (request, context, identity) => {
  const { id } = await context.params
  const registry = getRegistry(id)

  if (registry.readOnly) {
    throw new AppError(403, 'This registry is read only.')
  }

  const { repository, digest } = await readJson(request, deleteInput)
  await deleteManifest(registry, repository, digest, identity.username)

  return NextResponse.json({ success: true })
}, 'admin')

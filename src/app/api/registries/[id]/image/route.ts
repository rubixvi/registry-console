import { after, NextResponse } from 'next/server'

import { auditBackground } from '@/lib/audit'
import { deleteManifest } from '@/lib/registry/delete'
import { hubPrivacy } from '@/lib/registry/dockerhub'
import { imageDetails } from '@/lib/registry/image'
import { getRegistry } from '@/lib/registry/store'
import { scanTarget, scheduleScan } from '@/lib/registry/trivy'
import { scanPending } from '@/lib/registry/trivy-worker'
import { withIdentity } from '@/lib/security/access'
import { apiRequest } from '@/lib/security/api'
import { withLimits } from '@/lib/security/context'
import { AppError } from '@/lib/security/error'
import { readJson } from '@/lib/security/request'
import { deleteInput, imageInput } from '@/lib/validation/registry'

export const runtime = 'nodejs'
export const maxDuration = 660

export const GET = apiRequest(async (request, context) => {
  const { id } = await context.params
  const params = new URL(request.url).searchParams
  const parsed = imageInput.safeParse(Object.fromEntries(params))

  if (!parsed.success) {
    throw new AppError(400, 'Invalid image reference.')
  }

  const registry = getRegistry(id)
  const { repository, reference } = parsed.data
  const refresh = request.headers.get('x-registry-refresh') === '1'
  const isPrivate = await hubPrivacy(registry, repository, refresh)
  const details = await imageDetails(registry, repository, reference, refresh)

  if (
    isPrivate === false &&
    details.platformDetails.length &&
    scheduleScan(registry, repository, details.digest)
  ) {
    const target = scanTarget(registry, repository, details.digest)

    after(() =>
      auditBackground(() =>
        withIdentity({ username: 'system:trivy', role: 'admin' }, () =>
          withLimits(true, () => scanPending(target))
        )
      )
    )
  }

  return NextResponse.json({ ...details, isPrivate })
})

export const DELETE = apiRequest(async (request, context, identity) => {
  const { id } = await context.params
  const registry = getRegistry(id)

  if (registry.readOnly) {
    throw new AppError(403, 'This registry is read only.')
  }

  const { repository, digest } = await readJson(request, deleteInput)
  await deleteManifest(registry, repository, digest, identity.username)

  return NextResponse.json({ success: true })
}, 'admin')

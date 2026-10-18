import { after, NextResponse } from 'next/server'

import { hubPrivacy } from '@/lib/registry/dockerhub'
import { requirePublic } from '@/lib/registry/scan-policy'
import { getRegistry } from '@/lib/registry/store'
import { runScan, scanStatus, startScan } from '@/lib/registry/trivy'
import { api } from '@/lib/security/api'
import { withLimits } from '@/lib/security/context'
import { AppError } from '@/lib/security/error'
import { readJson } from '@/lib/security/request'
import { scanInput, scanQuery } from '@/lib/validation/scan'

export const runtime = 'nodejs'
export const maxDuration = 660

export const GET = api(async (request, context) => {
  const { id } = await context.params
  const parsed = scanQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams))

  if (!parsed.success) {
    throw new AppError(400, 'Invalid scan reference.')
  }

  const registry = getRegistry(id)

  if ((await hubPrivacy(registry, parsed.data.repository)) !== false) {
    return NextResponse.json({ enabled: false, status: 'not-scanned' })
  }

  return NextResponse.json(scanStatus(registry, parsed.data.repository, parsed.data.digest))
})

export const POST = api(async (request, context, identity) => {
  const { id } = await context.params
  const { repository, digest, override } = await readJson(request, scanInput)

  const registry = getRegistry(id)
  const status = scanStatus(registry, repository, digest)

  if (status.status === 'complete') {
    await requirePublic(registry, repository)
    return NextResponse.json(status)
  }

  if (status.status === 'running') {
    await requirePublic(registry, repository)
    return NextResponse.json(status, { status: 202 })
  }

  const job = await startScan(registry, repository, digest, identity.username, override)

  if (!job) {
    throw new AppError(422, 'This reference has no runnable image to scan.')
  }

  if (job.started) after(() => withLimits(true, () => runScan(job)))

  return NextResponse.json(scanStatus(registry, repository, digest), { status: 202 })
}, 'admin')

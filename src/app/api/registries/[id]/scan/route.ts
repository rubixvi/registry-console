import { after, NextResponse } from 'next/server'

import { getRegistry } from '@/lib/registry/store'
import { runScan, scanStatus, startScan } from '@/lib/registry/trivy'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
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

  return NextResponse.json(scanStatus(registry, parsed.data.repository, parsed.data.digest))
})

export const POST = api(async (request, context, identity) => {
  const { id } = await context.params
  const { repository, digest, override } = await readJson(request, scanInput)

  rateLimit(`trivy-start:${identity.username}`, 16, 60_000)

  const registry = getRegistry(id)
  const status = scanStatus(registry, repository, digest)

  if (status.status === 'complete') {
    return NextResponse.json(status)
  }

  const job = await startScan(registry, repository, digest, identity.username, override)

  if (!job) {
    throw new AppError(422, 'This reference has no runnable image to scan.')
  }

  after(() => runScan(job))

  return NextResponse.json({ enabled: true, status: 'running' }, { status: 202 })
}, 'admin')

import { after, NextResponse } from 'next/server'
import { z } from 'zod'

import { getRegistry } from '@/lib/registry/store'
import { prepareScan, runScan, scanStatus } from '@/lib/registry/trivy'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { rateLimit } from '@/lib/security/rate-limit'
import { readJson } from '@/lib/security/request'
import { digestName, repositoryName } from '@/lib/validation/registry'

export const runtime = 'nodejs'
export const maxDuration = 660

const input = z.object({ repository: repositoryName, digest: digestName }).strict()

export const GET = api(async (request, context) => {
  const { id } = await context.params
  const parsed = input.safeParse(Object.fromEntries(request.nextUrl.searchParams))

  if (!parsed.success) {
    throw new AppError(400, 'Invalid scan reference.')
  }

  const registry = getRegistry(id)

  return NextResponse.json(scanStatus(registry, parsed.data.repository, parsed.data.digest))
})

export const POST = api(async (request, context, identity) => {
  const { id } = await context.params
  const { repository, digest } = await readJson(request, input)

  rateLimit(`trivy-start:${identity.username}`, 4, 60_000)

  const job = prepareScan(getRegistry(id), repository, digest, identity.username)

  after(() => runScan(job))

  return NextResponse.json({ enabled: true, status: 'running' }, { status: 202 })
}, 'admin')

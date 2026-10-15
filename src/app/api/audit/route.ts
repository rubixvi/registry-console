import { NextResponse } from 'next/server'

import { auditPage } from '@/lib/database/audit'
import { api } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { auditInput } from '@/lib/validation/audit'

export const GET = api(async (request) => {
  const parsed = auditInput.safeParse(Object.fromEntries(request.nextUrl.searchParams))

  if (!parsed.success) {
    throw new AppError(400, 'Invalid audit filters. Check the supplied dates and fields.')
  }

  return NextResponse.json(auditPage(parsed.data))
}, 'admin')

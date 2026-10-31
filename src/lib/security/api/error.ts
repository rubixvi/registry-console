import 'server-only'

import { NextResponse } from 'next/server'

import { AppError } from '@/lib/security/error'

const DEFAULT_ERROR = 'Operation failed. Check the server configuration or registry connection.'

export function apiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const headers = new Headers({ 'Cache-Control': 'no-store' })

    if (error.retryAfter !== undefined || error.status === 429) {
      headers.set('Retry-After', String(error.retryAfter ?? 60))
    }

    return NextResponse.json({ error: error.message }, { status: error.status, headers })
  }

  const errorName = error instanceof Error ? error.name : 'UnknownError'

  console.error('Operation failed', errorName)

  return NextResponse.json(
    { error: DEFAULT_ERROR },
    {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}

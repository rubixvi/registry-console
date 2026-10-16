import { NextResponse } from 'next/server'

import { databaseReady } from '@/lib/database/health'

export function GET() {
  const ready = databaseReady()

  return NextResponse.json(
    { status: ready ? 'ok' : 'unavailable' },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}

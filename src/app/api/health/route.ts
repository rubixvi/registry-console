import { NextResponse } from 'next/server'

import { database } from '@/lib/database/client'

export function GET() {
  const headers = { 'Cache-Control': 'no-store' }

  try {
    database().prepare('SELECT 1').get()

    return NextResponse.json({ status: 'ok' }, { headers })
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers })
  }
}

import { NextResponse } from 'next/server'

import { apiError } from '@/lib/security/api'
import { getLogo } from '@/lib/settings/logo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  try {
    const logo = getLogo()

    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    }

    if (!logo) {
      return new NextResponse(null, { status: 404, headers })
    }

    return new NextResponse(new Uint8Array(logo), {
      headers: {
        ...headers,
        'Content-Type': 'image/png',
      },
    })
  } catch (error) {
    return apiError(error)
  }
}

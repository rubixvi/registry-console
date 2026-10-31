import { NextResponse } from 'next/server'

import { apiRequest } from '@/lib/security/api'
import { AppError } from '@/lib/security/error'
import { readBytes, readJson } from '@/lib/security/request'
import { getSettings, removeLogo, updateSettings } from '@/lib/settings'
import { MAX_LOGO_BYTES, validateLogo } from '@/lib/settings/logo'
import { brandingInput } from '@/lib/validation/branding'
import { type Branding } from '@/types/branding'

export const GET = apiRequest(async () => {
  return NextResponse.json(getSettings())
})

export const PUT = apiRequest(async (request, _context, identity) => {
  const contentType = request.headers.get('content-type') ?? ''

  let settings: Branding
  let logo: Buffer | undefined
  let remove = false

  if (contentType.toLowerCase().startsWith('multipart/form-data;')) {
    const bytes = await readBytes(request, MAX_LOGO_BYTES + 64 * 1024)

    let form: FormData

    try {
      form = await new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': contentType,
        },
      }).formData()
    } catch {
      throw new AppError(400, 'Invalid upload form.')
    }

    const current = getSettings()
    const file = form.get('logo')

    remove = form.get('removeLogo') === 'true'

    let logoPath = remove ? '' : current.logoPath

    if (file instanceof File && file.size > 0) {
      if (remove) {
        throw new AppError(400, 'Choose either uploading or removing the logo.')
      }

      if (file.type !== 'image/png' || !file.name.toLowerCase().endsWith('.png')) {
        throw new AppError(400, 'Only PNG images are supported.')
      }

      logo = Buffer.from(await file.arrayBuffer())
      logoPath = `/api/branding/logo.png?v=${validateLogo(logo)}`
    }

    const parsed = brandingInput.safeParse({
      name: form.get('name'),
      footer: form.get('footer'),
      accent: form.get('accent'),
      logoPath,
    })

    if (!parsed.success) {
      throw new AppError(400, 'Invalid branding settings.')
    }

    settings = parsed.data
  } else {
    settings = await readJson(request, brandingInput)
  }

  updateSettings({ settings, username: identity.username, logo, remove })

  return NextResponse.json({ success: true })
}, 'admin')

export const DELETE = apiRequest(async (_request, _context, identity) => {
  removeLogo(identity.username)

  return NextResponse.json({ success: true })
}, 'admin')

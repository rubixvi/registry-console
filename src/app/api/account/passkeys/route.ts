import { NextResponse } from 'next/server'

import { removePasskey } from '@/lib/auth/passkey'
import { requireSecurity } from '@/lib/auth/requests'
import { configUser } from '@/lib/auth/verification'
import { audit } from '@/lib/database/audit'
import { api } from '@/lib/security/api'
import { readJson } from '@/lib/security/request'
import { passkeyIdInput } from '@/lib/validation/security'

export const DELETE = api(async (request, _context, identity) => {
  requireSecurity(request, identity.username)

  const { id } = await readJson(request, passkeyIdInput)
  const user = configUser(identity.username)

  removePasskey(user, id)

  audit(identity.username, 'security.passkey.removed', id)

  return NextResponse.json({ success: true })
})

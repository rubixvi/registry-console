import { NextResponse } from 'next/server'

import { securityId } from '@/lib/auth/accounts'
import { requireSecurity } from '@/lib/auth/requests'
import { configUser } from '@/lib/auth/verification'
import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
import { api } from '@/lib/security/api'
import { readJson } from '@/lib/security/request'
import { passkeyIdInput } from '@/lib/validation/security'

export const DELETE = api(async (request, _context, identity) => {
  requireSecurity(request, identity.username)

  const { id } = await readJson(request, passkeyIdInput)
  const user = configUser(identity.username)

  database()
    .prepare(`
      DELETE FROM passkeys WHERE id = ? AND username = ? AND fingerprint = ?
    `)
    .run(id, user.username, securityId(user))

  audit(identity.username, 'security.passkey.removed', id)

  return NextResponse.json({ success: true })
})

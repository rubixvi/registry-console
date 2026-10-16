import 'server-only'

import { generateAuthenticationOptions } from '@simplewebauthn/server'

import { passkeyHost } from '@/lib/auth/passkey'

export async function authenticationOptions() {
  return generateAuthenticationOptions({
    rpID: passkeyHost().rpID,
    userVerification: 'required',
  })
}

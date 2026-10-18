import { type Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { Heading } from '@/components/layout/heading'
import { Security } from '@/components/security'
import { passkeyInfo } from '@/lib/auth/passkey'
import { readRequest } from '@/lib/auth/requests'
import { getIdentity } from '@/lib/auth/session'
import { ssoProviders } from '@/lib/auth/sso'
import { getAuthenticator } from '@/lib/auth/totp'
import { configUser } from '@/lib/auth/verification'
import { env } from '@/lib/config/env'

export const metadata: Metadata = {
  title: 'Security',
  description: 'Manage your passkeys and authenticator app.',
}

export default async function AccountPage() {
  const identity = await getIdentity()

  if (!identity) redirect('/login')

  const user = configUser(identity.username)
  const authenticator = getAuthenticator(user)

  const recovery = authenticator ? (JSON.parse(authenticator.recovery) as string[]).length : 0

  let ssoVerified = false

  try {
    const request = new Request(env().APP_ORIGIN, { headers: await headers() })
    const pending = readRequest(request, 'sso-verify')

    ssoVerified = pending.username === user.username
  } catch {
    ssoVerified = false
  }

  return (
    <>
      <Heading description="Manage your passkeys and authenticator app." title="Security" />

      <Security
        status={{
          passkeys: passkeyInfo(user),
          directoryAccount: user.authProvider === 'ldap',
          ssoAccount: user.authProvider === 'sso',
          ssoVerified,
          providers:
            user.email && user.authProvider !== 'ldap'
              ? ssoProviders().map((provider) => ({
                  id: provider.id,
                  name: provider.name ?? provider.id,
                }))
              : [],
          totpEnabled: Boolean(authenticator),
          recoveryRemaining: recovery,
        }}
      />
    </>
  )
}

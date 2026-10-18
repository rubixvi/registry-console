import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Security } from '@/components/account/security'
import { Heading } from '@/components/layout/heading'
import { passkeyInfo } from '@/lib/auth/passkey'
import { getIdentity } from '@/lib/auth/session'
import { getAuthenticator } from '@/lib/auth/totp'
import { configUser } from '@/lib/auth/verification'

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

  return (
    <>
      <Heading description="Manage your passkeys and authenticator app." title="Security" />

      <Security
        status={{
          passkeys: passkeyInfo(user),
          directoryAccount: user.authProvider === 'ldap',
          totpEnabled: Boolean(authenticator),
          recoveryRemaining: recovery,
        }}
      />
    </>
  )
}

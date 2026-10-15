import { redirect } from 'next/navigation'

import { Security } from '@/components/account/security'
import { PageHeading } from '@/components/layout/page-heading'
import { passkeySummaries } from '@/lib/auth/passkeys'
import { getIdentity } from '@/lib/auth/session'
import { getAuthenticator } from '@/lib/auth/totp'
import { configUser } from '@/lib/auth/verification'

export default async function AccountPage() {
  const identity = await getIdentity()

  if (!identity) redirect('/login')

  const user = configUser(identity.username)
  const authenticator = getAuthenticator(user)

  return (
    <>
      <PageHeading description="Manage your passkeys and authenticator app." title="Security" />

      <Security
        status={{
          passkeys: passkeySummaries(user),
          totpEnabled: Boolean(authenticator),
          recoveryRemaining: authenticator
            ? (JSON.parse(authenticator.recovery) as string[]).length
            : 0,
        }}
      />
    </>
  )
}

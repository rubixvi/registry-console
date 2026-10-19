import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Heading } from '@/components/layout/heading'
import { Access } from '@/components/settings/access'
import { Branding } from '@/components/settings/branding'
import { Users } from '@/components/settings/users'
import { getIdentity } from '@/lib/auth/session'
import { users } from '@/lib/config/users'
import { getSettings } from '@/lib/settings'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Apply your branding across the workspace and login screen.',
}

export default async function SettingsPage() {
  const identity = await getIdentity()

  if (identity?.role !== 'admin') redirect('/')

  const branding = getSettings()
  const configUsers = users()

  return (
    <>
      <Heading
        description="Apply your branding across the workspace and login screen."
        title="Settings"
      />

      <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="min-w-0 rounded-xl border bg-card p-6 shadow-xs">
          <Branding branding={branding} />
        </section>

        <div className="min-w-0 space-y-6">
          <Users users={configUsers} />
          <Access />
        </div>
      </div>
    </>
  )
}

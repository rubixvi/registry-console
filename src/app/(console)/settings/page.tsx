import { type Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldCheck, Users } from 'lucide-react'

import { Heading } from '@/components/layout/heading'
import { BrandingForm } from '@/components/settings/branding'
import { Badge } from '@/components/ui/badge'
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
          <BrandingForm branding={branding} />
        </section>

        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border bg-card p-6">
            <h2 className="mb-5 flex items-center gap-2 font-semibold">
              <Users aria-hidden="true" className="size-4 text-primary" />
              Users
            </h2>

            <ul className="divide-y">
              {configUsers.map((user) => (
                <li
                  className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0"
                  key={user.username}
                >
                  <span className="min-w-0 truncate">{user.username}</span>
                  <Badge className="min-w-16 shrink-0 justify-center capitalize">{user.role}</Badge>
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs leading-6 text-muted-foreground">
              Manage usernames, password hashes, and roles using environment variables. Restart the
              application to apply changes.
            </p>
          </section>

          <section className="rounded-xl border bg-card p-6">
            <h2 className="mb-5 flex items-center gap-2 font-semibold">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              Access
            </h2>

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-4">
              <dt>
                <Badge className="min-w-16 justify-center">Admin</Badge>
              </dt>
              <dd className="text-xs leading-6 text-muted-foreground">
                Manage connections, branding, and image deletion.
              </dd>

              <dt>
                <Badge className="min-w-16 justify-center">Viewer</Badge>
              </dt>
              <dd className="text-xs leading-6 text-muted-foreground">
                Browse every configured registry.
              </dd>
            </dl>

            <p className="mt-5 border-t pt-4 text-xs leading-6 text-muted-foreground">
              Mark a connection as read only to disable deletion.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}

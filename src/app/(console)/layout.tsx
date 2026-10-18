import { type ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { Sidebar } from '@/components/layout/sidebar'
import { getIdentity } from '@/lib/auth/session'
import { getRegistries } from '@/lib/registry/store'
import { getSettings } from '@/lib/settings'

type Props = {
  children: ReactNode
}

export default async function ConsoleLayout({ children }: Props) {
  const identity = await getIdentity()

  if (!identity) redirect('/login')

  const branding = getSettings()
  const registries = getRegistries().map(({ id, name }) => ({ id, name }))

  return (
    <div className="min-h-dvh">
      <Sidebar branding={branding} identity={identity} registries={registries} />

      <main className="min-w-0 px-5 py-8 lg:ml-64 lg:px-10 lg:py-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}

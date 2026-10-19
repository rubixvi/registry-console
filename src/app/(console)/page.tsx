import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { RegistryList } from '@/components/registry/list'
import { getIdentity } from '@/lib/auth/session'
import { getRegistries } from '@/lib/registry/store'

export const metadata: Metadata = {
  title: 'Registries',
  description: 'Browse and manage your connected registries.',
}

export default async function HomePage() {
  const identity = await getIdentity()

  if (!identity) redirect('/login')

  const registries = getRegistries()

  return <RegistryList identity={identity} registries={registries} />
}

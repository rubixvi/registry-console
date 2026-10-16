import { type Metadata } from 'next'
import { redirect } from 'next/navigation'

import { RegistryList } from '@/components/registry/registry-list'
import { getIdentity } from '@/lib/auth/session'
import { getRegistries, seedRegistry } from '@/lib/registry/store'

export const metadata: Metadata = {
  title: 'Registries',
  description: 'Browse and manage your connected registries.',
}

export default async function HomePage() {
  const identity = await getIdentity()

  if (!identity) redirect('/login')

  seedRegistry()

  const registries = getRegistries()

  return <RegistryList identity={identity} registries={registries} />
}

import { notFound, redirect } from 'next/navigation'

import { getIdentity } from '@/lib/auth/session'
import { getRegistries } from '@/lib/registry/store'
import { referenceName, repositoryName } from '@/lib/validation/registry'

export type RegistryProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    repository?: string
    reference?: string
  }>
}

export async function getRegistry({ params, searchParams }: RegistryProps) {
  const identity = await getIdentity()

  if (!identity) redirect('/login')

  const { id } = await params
  const { repository, reference } = await searchParams
  const registry = getRegistries().find((registry) => registry.id === id)

  if (!registry) notFound()

  if (repository !== undefined && !repositoryName.safeParse(repository).success) {
    notFound()
  }

  if (reference !== undefined && (!repository || !referenceName.safeParse(reference).success)) {
    notFound()
  }

  return { identity, id, registry, repository, reference }
}

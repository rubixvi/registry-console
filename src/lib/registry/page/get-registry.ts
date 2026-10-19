import 'server-only'

import { notFound, redirect } from 'next/navigation'

import { getIdentity } from '@/lib/auth/session'
import { requireRepository } from '@/lib/registry/access'
import { getRegistries, getRegistry as readRegistry } from '@/lib/registry/store'
import { withIdentity } from '@/lib/security/access'
import { referenceName, repositoryName } from '@/lib/validation/registry'
import { type RegistryProps } from '@/types/registry'

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

  if (repository) {
    try {
      await withIdentity(identity, () => requireRepository(readRegistry(id), repository))
    } catch {
      notFound()
    }
  }

  return { identity, id, registry, repository, reference }
}

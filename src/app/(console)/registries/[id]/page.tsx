import { type Metadata } from 'next'

import { Registry } from '@/components/registry'
import { getRegistry } from '@/lib/registry/page'
import { type RegistryProps } from '@/types/registry'

export async function generateMetadata(props: RegistryProps): Promise<Metadata> {
  const { registry, repository, reference } = await getRegistry(props)

  if (repository && reference) {
    return {
      title: `${repository}:${reference}`,
      description: `Inspect ${repository}:${reference} in ${registry.name}.`,
    }
  }

  if (repository) {
    return {
      title: repository,
      description: `Browse image tags for ${repository} in ${registry.name}.`,
    }
  }

  return {
    title: registry.name,
    description: `Browse repositories in ${registry.name}.`,
  }
}

export default async function RegistryPage(props: RegistryProps) {
  const { identity, id, registry, repository, reference } = await getRegistry(props)

  return (
    <Registry
      admin={identity.role === 'admin'}
      id={id}
      reference={reference}
      registry={registry}
      repository={repository}
    />
  )
}

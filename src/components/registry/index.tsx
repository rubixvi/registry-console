import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { Heading } from '@/components/layout/heading'
import { Breadcrumbs } from '@/components/registry/breadcrumbs'
import { Actions } from '@/components/registry/connection/actions'
import { Inspector } from '@/components/registry/image/inspector'
import { Repository } from '@/components/registry/repository'
import { Tag } from '@/components/registry/tags/list'
import { Badge } from '@/components/ui/badge'
import { env } from '@/lib/config/env'
import { type Registry as RegistryType } from '@/types/registry'

type Props = {
  id: string
  registry: RegistryType
  repository?: string
  reference?: string
  admin: boolean
}

export function Registry({ id, registry, repository, reference, admin }: Props) {
  const path = `/registries/${encodeURIComponent(id)}`

  const repoLink = {
    pathname: path,
    query: { repository },
  }

  let content = <Repository id={id} key={id} />

  if (repository && reference) {
    content = (
      <Inspector
        admin={admin}
        key={`${repository}@${reference}`}
        pullUrl={
          registry.pullUrl ||
          (registry.provider === 'dockerhub'
            ? 'https://registry-1.docker.io'
            : registry.provider === 'github'
              ? 'https://ghcr.io'
              : env().PULL_URL)
        }
        reference={reference}
        registry={registry}
        repository={repository}
      />
    )
  } else if (repository) {
    content = (
      <Tag
        admin={admin}
        defaultOrder={env().TAGLIST_ORDER}
        id={id}
        key={`${id}/${repository}`}
        readOnly={registry.readOnly}
        repository={repository}
        trivyEnabled={registry.trivyEnabled}
      />
    )
  }

  return (
    <>
      <Breadcrumbs id={id} name={registry.name} reference={reference} repository={repository} />

      <Heading description={registry.url} title={repository || registry.name}>
        {!repository && <Actions admin={admin} registry={registry} />}
        {!registry.readOnly && <Badge>Read only</Badge>}
      </Heading>

      {repository && (
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
          href={reference ? repoLink : path}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {reference ? 'Back to tags' : 'Back to repositories'}
        </Link>
      )}

      {content}
    </>
  )
}

import { type Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'

import { Heading } from '@/components/layout/heading'
import { Connection } from '@/components/registry/controls/connection'
import { Inspector } from '@/components/registry/image/inspector'
import { Repository } from '@/components/registry/repository'
import { Tag } from '@/components/registry/tags/tag'
import { Badge } from '@/components/ui/badge'
import { env } from '@/lib/config/env'
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

  const admin = identity.role === 'admin'

  const path = `/registries/${encodeURIComponent(id)}`

  const repoLink = {
    pathname: path,
    query: { repository },
  }

  let content = <Repository id={id} key={id} provider={registry.provider} />

  if (repository && reference) {
    content = (
      <Inspector
        admin={admin}
        key={`${repository}@${reference}`}
        pullUrl={
          registry.pullUrl ||
          (registry.provider === 'dockerhub' ? 'https://docker.io' : env().PULL_URL)
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
      <nav
        aria-label="Breadcrumb"
        className="mb-7 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      >
        <Link className="hover:text-primary" href="/">
          Registries
        </Link>

        <ChevronRight aria-hidden="true" className="size-3 shrink-0" />

        <Link
          aria-current={!repository ? 'page' : undefined}
          className="break-all hover:text-primary"
          href={path}
        >
          {registry.name}
        </Link>

        {repository && (
          <>
            <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
            <Link
              aria-current={!reference ? 'page' : undefined}
              className="break-all hover:text-primary"
              href={repoLink}
            >
              {repository}
            </Link>
          </>
        )}

        {reference && (
          <>
            <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
            <span aria-current="page" className="max-w-sm truncate" title={reference}>
              {reference}
            </span>
          </>
        )}
      </nav>

      <Heading
        description={registry.url}
        eyebrow={repository ? 'Repository' : 'Registry'}
        title={repository || registry.name}
      >
        {registry.readOnly && <Badge>Read only</Badge>}
      </Heading>

      {!repository && <Connection admin={admin} registry={registry} />}

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

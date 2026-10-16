import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ChevronRight } from 'lucide-react'

import { PageHeading } from '@/components/layout/page-heading'
import { Connection } from '@/components/registry/connection'
import { Inspector } from '@/components/registry/inspector'
import { Repository } from '@/components/registry/repository'
import { Tag } from '@/components/registry/tag'
import { Badge } from '@/components/ui/badge'
import { getIdentity } from '@/lib/auth/session'
import { env } from '@/lib/config/env'
import { getRegistries } from '@/lib/registry/store'
import { referenceName, repositoryName } from '@/lib/validation/registry'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    repository?: string
    reference?: string
  }>
}

export default async function RegistryPage({ params, searchParams }: Props) {
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

  const admin = identity.role === 'admin'

  const registryPath = `/registries/${encodeURIComponent(id)}`
  const repositoryHref = {
    pathname: registryPath,
    query: { repository },
  }

  let content = <Repository id={id} key={id} />

  if (repository && reference) {
    content = (
      <Inspector
        admin={admin}
        key={`${repository}@${reference}`}
        pullUrl={registry.pullUrl || env().PULL_URL}
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
          href={registryPath}
        >
          {registry.name}
        </Link>

        {repository && (
          <>
            <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
            <Link
              aria-current={!reference ? 'page' : undefined}
              className="break-all hover:text-primary"
              href={repositoryHref}
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

      <PageHeading
        description={registry.url}
        eyebrow={repository ? 'Repository' : 'Registry connection'}
        title={repository || registry.name}
      >
        {registry.readOnly && <Badge>Read only</Badge>}
      </PageHeading>

      {!repository && <Connection admin={admin} registry={registry} />}

      {repository && (
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
          href={reference ? repositoryHref : registryPath}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {reference ? 'Back to tags' : 'Back to repositories'}
        </Link>
      )}

      {content}
    </>
  )
}

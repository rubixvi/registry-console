import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

type Props = {
  id: string
  name: string
  repository?: string
  reference?: string
}

export function RegistryBreadcrumbs({ id, name, repository, reference }: Props) {
  const path = `/registries/${encodeURIComponent(id)}`

  return (
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
        {name}
      </Link>

      {repository && (
        <>
          <ChevronRight aria-hidden="true" className="size-3 shrink-0" />
          <Link
            aria-current={!reference ? 'page' : undefined}
            className="break-all hover:text-primary"
            href={{
              pathname: path,
              query: { repository },
            }}
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
  )
}

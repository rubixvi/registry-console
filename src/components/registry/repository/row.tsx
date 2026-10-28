import Link from 'next/link'
import { ArrowRight, Package } from 'lucide-react'

import { Tags } from '@/components/registry/tags/preview'

type Props = {
  id: string
  name: string
}

export function Row({ id, name }: Props) {
  const href = {
    pathname: `/registries/${encodeURIComponent(id)}`,
    query: { repository: name },
  }

  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Package aria-hidden="true" className="size-4 text-muted-foreground" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Link className="break-all text-sm font-medium hover:text-primary" href={href}>
          {name}
        </Link>

        <Tags id={id} repository={name} />
      </div>

      <Link
        aria-label={`View tags for ${name}`}
        className="shrink-0 text-muted-foreground hover:text-primary"
        href={href}
      >
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </li>
  )
}

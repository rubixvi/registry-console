import Link from 'next/link'
import { ArrowUpRight, Container, Eye, LockKeyhole } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { type Registry } from '@/types/registry'

type Props = {
  registry: Registry
}

export function RegistryCard({ registry }: Props) {
  return (
    <Link
      className="group flex min-w-0 flex-col rounded-xl border bg-card p-6 shadow-xs transition hover:border-primary/40 hover:shadow-md"
      href={`/registries/${encodeURIComponent(registry.id)}`}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <Container aria-hidden="true" className="size-6" />
        </span>

        <ArrowUpRight
          aria-hidden="true"
          className="size-5 text-muted-foreground transition-colors group-hover:text-primary"
        />
      </div>

      <h2 className="truncate font-semibold">{registry.name}</h2>
      <p className="mt-2 truncate text-sm text-muted-foreground">{registry.url}</p>

      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        <Badge>
          <LockKeyhole aria-hidden="true" className="size-3" />
          {registry.hasPassword ? 'Credentials configured' : 'No password configured'}
        </Badge>

        {registry.readOnly && (
          <Badge>
            <Eye aria-hidden="true" className="size-3" />
            Read only
          </Badge>
        )}
      </div>
    </Link>
  )
}

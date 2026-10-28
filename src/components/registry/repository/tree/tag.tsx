'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Tag as TagIcon } from 'lucide-react'

import { Manifest } from '@/components/registry/repository/tree/manifest'

type Props = {
  id: string
  repository: string
  tag: string
}

export function ImageTag({ id, repository, tag }: Props) {
  const [open, setOpen] = useState(false)

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-3 top-4.75 h-px w-3 bg-border"
      />

      <div className="group flex min-h-9 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60 focus-within:bg-muted/40">
        <button
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Inspect'} image tag ${repository}:${tag}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <Chevron aria-hidden="true" className="size-4" />
        </button>

        <Link
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-xs hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={{
            pathname: `/registries/${encodeURIComponent(id)}`,
            query: { repository, reference: tag },
          }}
        >
          <TagIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-all">{tag}</span>
        </Link>
      </div>

      {open && (
        <div
          className={[
            'ml-4.75 pl-3',
            '[&>ul>li]:before:pointer-events-none',
            '[&>ul>li]:before:absolute',
            '[&>ul>li]:before:-left-3',
            '[&>ul>li]:before:top-0',
            '[&>ul>li]:before:bottom-0',
            '[&>ul>li]:before:w-px',
            '[&>ul>li]:before:bg-border/70',
            '[&>ul>li:last-child]:before:bottom-auto',
            '[&>ul>li:last-child]:before:h-4.75',
          ].join(' ')}
        >
          <Manifest id={id} reference={tag} repository={repository} />
        </div>
      )}
    </li>
  )
}

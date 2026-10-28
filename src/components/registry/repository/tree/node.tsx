'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronRight, Folder, Package } from 'lucide-react'

import { Branch } from '@/components/registry/repository/tree/branch'
import { Tags } from '@/components/registry/tags/preview'
import { Button } from '@/components/ui/button'
import { type NamespaceNode } from '@/types/registry'

type Props = {
  id: string
  node: NamespaceNode
  expanded: boolean
}

export function Node({ id, node, expanded }: Props) {
  const [open, setOpen] = useState(expanded)

  const href = {
    pathname: `/registries/${encodeURIComponent(id)}`,
    query: { repository: node.path },
  }

  if (!node.children.length) {
    return (
      <li className="flex items-center gap-3 rounded-md px-3 py-3 hover:bg-muted/30">
        <Package aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Link className="break-all text-sm font-medium hover:text-primary" href={href}>
            {node.name}
          </Link>

          <Tags id={id} repository={node.path} />
        </div>

        <Button aria-label={`View tags for ${node.path}`} asChild size="icon" variant="ghost">
          <Link href={href}>
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </li>
    )
  }

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-3">
        <Button
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${node.path}`}
          onClick={() => setOpen(!open)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Chevron aria-hidden="true" className="size-4" />
        </Button>

        <Folder aria-hidden="true" className="size-4 shrink-0 text-primary" />

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          {node.repository ? (
            <>
              <Link className="break-all text-sm font-medium hover:text-primary" href={href}>
                {node.name}
              </Link>

              <Tags id={id} repository={node.path} />
            </>
          ) : (
            <button
              aria-expanded={open}
              className="text-left text-sm break-all hover:text-primary"
              onClick={() => setOpen(!open)}
              type="button"
            >
              {node.name}
            </button>
          )}
        </div>

        {node.repository && (
          <Button aria-label={`View tags for ${node.path}`} asChild size="icon" variant="ghost">
            <Link href={href}>
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        )}
      </div>

      {open && (
        <div className="ml-4 border-l pl-2 sm:ml-6">
          <Branch expanded={expanded} id={id} nodes={node.children} />
        </div>
      )}
    </li>
  )
}

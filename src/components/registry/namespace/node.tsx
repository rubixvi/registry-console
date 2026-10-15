'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Folder, Package } from 'lucide-react'

import { Branch } from '@/components/registry/namespace/branch'
import { Button } from '@/components/ui/button'
import { type NamespaceNode } from '@/types/namespace'

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
      <li>
        <Link
          className="flex min-w-0 items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-muted/50"
          href={href}
        >
          <Package aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="break-all">{node.name}</span>
        </Link>
      </li>
    )
  }

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <li>
      <div className="flex items-center gap-2">
        <Button
          aria-expanded={open}
          className="h-auto min-w-0 flex-1 justify-start gap-2 px-3 py-3 text-left font-normal"
          onClick={() => setOpen(!open)}
          type="button"
          variant="ghost"
        >
          <Chevron aria-hidden="true" className="size-4 shrink-0" />
          <Folder aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 whitespace-normal break-all">{node.name}</span>
        </Button>

        {node.repository && (
          <Button aria-label={`View tags for ${node.path}`} asChild size="icon" variant="ghost">
            <Link href={href}>
              <Package aria-hidden="true" className="size-4" />
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

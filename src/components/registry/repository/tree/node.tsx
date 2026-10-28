'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, ChevronRight, Folder, FolderOpen, Package } from 'lucide-react'

import { Branch } from '@/components/registry/repository/tree/branch'
import { RepositoryTags } from '@/components/registry/repository/tree/tags'
import { Button } from '@/components/ui/button'
import { type NamespaceNode } from '@/types/registry'

type Props = {
  id: string
  node: NamespaceNode
  depth: number
  expandDepth: number
  autoOpenPath?: string
}

export function Node({ id, node, depth, expandDepth, autoOpenPath }: Props) {
  const hasChildren = node.children.length > 0
  const expandable = hasChildren || node.repository
  const [open, setOpen] = useState(
    node.repository ? node.path === autoOpenPath : depth < expandDepth
  )

  const href = {
    pathname: `/registries/${encodeURIComponent(id)}`,
    query: { repository: node.path },
  }

  const Chevron = open ? ChevronDown : ChevronRight
  const Icon = node.repository ? Package : open ? FolderOpen : Folder

  return (
    <li className="relative">
      {depth > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-3 top-4.75 h-px w-3 bg-border"
        />
      )}

      <div className="group flex min-h-9 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60 focus-within:bg-muted/40">
        {expandable ? (
          <button
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.path}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <Chevron aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}

        {node.repository ? (
          <Link
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-sm font-medium hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={href}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-all">{node.name}</span>
          </Link>
        ) : (
          <button
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 break-all">{node.name}</span>
          </button>
        )}

        {node.repository && (
          <Button
            aria-label={`Open ${node.path}`}
            asChild
            className="size-7 shrink-0 opacity-70 group-hover:opacity-100 focus-within:opacity-100"
            size="icon"
            variant="ghost"
          >
            <Link href={href}>
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        )}
      </div>

      {open && (
        <>
          {hasChildren && (
            <Branch
              autoOpenPath={autoOpenPath}
              depth={depth + 1}
              expandDepth={expandDepth}
              id={id}
              nodes={node.children}
            />
          )}

          {node.repository && (
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
              <RepositoryTags id={id} repository={node.path} />
            </div>
          )}
        </>
      )}
    </li>
  )
}

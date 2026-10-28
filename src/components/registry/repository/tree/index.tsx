'use client'

import { useMemo, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown, FolderTree } from 'lucide-react'

import { Branch } from '@/components/registry/repository/tree/branch'
import { Button } from '@/components/ui/button'
import { namespaceTree } from '@/utils/namespace-tree'

type Props = {
  id: string
  repositories: string[]
  query: string
}

type Expansion = 'initial' | 'all' | 'none'

export function Namespace({ id, repositories, query }: Props) {
  const nodes = useMemo(() => namespaceTree(repositories), [repositories])

  const [expansion, setExpansion] = useState<{ mode: Expansion; revision: number }>({
    mode: 'initial',
    revision: 0,
  })

  const hasNamespaces = nodes.some((node) => node.children.length > 0)
  const expandDepth =
    expansion.mode === 'all'
      ? Infinity
      : expansion.mode === 'none'
        ? 0
        : query.trim()
          ? Infinity
          : 1

  const autoOpenPath =
    expansion.mode === 'initial' && repositories.length === 1 ? repositories[0] : undefined

  function changeExpansion(mode: Expansion): void {
    setExpansion((current) => ({ mode, revision: current.revision + 1 }))
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderTree aria-hidden="true" className="size-4" />
          <span className="font-medium">Image explorer</span>
        </div>

        {hasNamespaces && (
          <div className="flex items-center gap-1">
            <Button onClick={() => changeExpansion('all')} size="sm" type="button" variant="ghost">
              <ChevronsUpDown aria-hidden="true" className="size-3.5" />
              Expand namespaces
            </Button>

            <Button onClick={() => changeExpansion('none')} size="sm" type="button" variant="ghost">
              <ChevronsDownUp aria-hidden="true" className="size-3.5" />
              Collapse all
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto p-2 sm:p-3">
        <Branch
          autoOpenPath={autoOpenPath}
          depth={0}
          expandDepth={expandDepth}
          id={id}
          key={`${expansion.mode}:${expansion.revision}`}
          nodes={nodes}
        />
      </div>
    </div>
  )
}

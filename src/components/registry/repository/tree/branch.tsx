'use client'

import { useState } from 'react'

import { Node } from '@/components/registry/repository/tree/node'
import { Button } from '@/components/ui/button'
import { type NamespaceNode } from '@/types/registry'

const PAGE_SIZE = 100

type Props = {
  id: string
  nodes: NamespaceNode[]
  depth: number
  expandDepth: number
  autoOpenPath?: string
}

export function Branch({ id, nodes, depth, expandDepth, autoOpenPath }: Props) {
  const [limit, setLimit] = useState(PAGE_SIZE)

  return (
    <ul
      aria-label={depth === 0 ? 'Repositories and namespaces' : undefined}
      className={
        depth > 0
          ? [
              'ml-4.75 pl-3',
              '[&>li]:relative',
              '[&>li]:before:pointer-events-none',
              '[&>li]:before:absolute',
              '[&>li]:before:-left-3',
              '[&>li]:before:top-0',
              '[&>li]:before:bottom-0',
              '[&>li]:before:w-px',
              '[&>li]:before:bg-border/70',
              '[&>li:last-child]:before:bottom-auto',
              '[&>li:last-child]:before:h-4.75',
            ].join(' ')
          : ''
      }
    >
      {nodes.slice(0, limit).map((node) => (
        <Node
          autoOpenPath={autoOpenPath}
          depth={depth}
          expandDepth={expandDepth}
          id={id}
          key={node.path}
          node={node}
        />
      ))}

      {nodes.length > limit && (
        <li className="relative py-1 pl-2">
          {depth > 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-3 top-5 h-px w-3 bg-border"
            />
          )}

          <Button
            onClick={() => setLimit((current) => current + PAGE_SIZE)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Show more ({nodes.length - limit} remaining)
          </Button>
        </li>
      )}
    </ul>
  )
}

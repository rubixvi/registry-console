'use client'

import { useState } from 'react'

import { Node } from '@/components/registry/repository/tree/node'
import { Button } from '@/components/ui/button'
import { type NamespaceNode } from '@/types/registry'

type Props = {
  id: string
  nodes: NamespaceNode[]
  expanded: boolean
}

export function Branch({ id, nodes, expanded }: Props) {
  const [limit, setLimit] = useState(100)

  return (
    <ul className="space-y-1">
      {nodes.slice(0, limit).map((node) => (
        <Node expanded={expanded} id={id} key={node.path} node={node} />
      ))}

      {nodes.length > limit && (
        <li className="px-3 py-2">
          <Button onClick={() => setLimit(limit + 100)} size="sm" type="button" variant="outline">
            Show more ({nodes.length - limit} remaining)
          </Button>
        </li>
      )}
    </ul>
  )
}

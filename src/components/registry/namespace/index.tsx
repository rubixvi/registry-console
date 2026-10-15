'use client'

import { Branch } from '@/components/registry/namespace/branch'
import { namespaceTree } from '@/utils/namespace-tree'

type Props = {
  id: string
  repositories: string[]
  query: string
}

export function Namespace({ id, repositories, query }: Props) {
  const nodes = namespaceTree(repositories)

  return (
    <div className="overflow-x-auto p-3">
      <Branch expanded={Boolean(query)} id={id} key={query} nodes={nodes} />
    </div>
  )
}

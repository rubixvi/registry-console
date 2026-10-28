import { type NamespaceNode } from '@/types/registry'

function sortTree(nodes: NamespaceNode[]): void {
  nodes.sort((a, b) => {
    if (a.children.length && !b.children.length) return -1
    if (b.children.length && !a.children.length) return 1

    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })

  for (const node of nodes) {
    sortTree(node.children)
  }
}

export function namespaceTree(repositories: string[]): NamespaceNode[] {
  const roots: NamespaceNode[] = []
  const nodes = new Map<string, NamespaceNode>()

  for (const repository of new Set(repositories)) {
    let children = roots
    let path = ''

    for (const name of repository.split('/')) {
      path = path ? `${path}/${name}` : name

      let node = nodes.get(path)

      if (!node) {
        node = { name, path, repository: false, children: [] }
        nodes.set(path, node)
        children.push(node)
      }

      if (path === repository) node.repository = true

      children = node.children
    }
  }

  sortTree(roots)

  return roots
}

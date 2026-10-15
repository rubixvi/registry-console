import { type NamespaceNode } from '@/types/namespace'

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

  function sort(children: NamespaceNode[]): void {
    children.sort(
      (a, b) =>
        Number(b.children.length > 0) - Number(a.children.length > 0) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    )

    for (const node of children) sort(node.children)
  }

  sort(roots)

  return roots
}

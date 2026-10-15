export type NamespaceNode = {
  name: string
  path: string
  repository: boolean
  children: NamespaceNode[]
}

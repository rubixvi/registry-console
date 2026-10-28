export const REGISTRY_METHODS = ['GET', 'HEAD', 'DELETE'] as const
export const REGISTRY_CACHE = ['default', 'reload'] as const

export type RegistryProvider = 'distribution' | 'dockerhub' | 'github'
export type RegistryMethod = (typeof REGISTRY_METHODS)[number]
export type RegistryCache = (typeof REGISTRY_CACHE)[number]

export type RegistryProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    repository?: string
    reference?: string
  }>
}

export type Registry = {
  id: string
  name: string
  url: string
  pullUrl: string
  username: string
  hasPassword: boolean
  readOnly: boolean
  provider?: RegistryProvider
  namespace?: string
  trivyEnabled?: boolean
}

export type RegistryRecord = Omit<Registry, 'hasPassword'> & {
  revision?: string
  password: string
}

export type RegistryInput = Omit<Registry, 'id' | 'hasPassword' | 'trivyEnabled'> & {
  password: string
}

export type RegistryListing = {
  items: string[]
  dates?: Record<string, string | null>
}

export type RegistryPage = RegistryListing & {
  next: string | null
}

export type RegistryPageInput = {
  repository?: string
  dates?: boolean
  last: string
  n: number
}

export type RegistryOptions = {
  method?: RegistryMethod
  scope?: string
  cache?: RegistryCache
}

export type RegistryResponse = {
  text: string
  headers: Headers
}

export type RegistryRow = {
  revision: string
  provider: RegistryProvider
  namespace: string
  id: string
  name: string
  url: string
  username: string
  password: string
  read_only: number
  pull_url: string
}

export type RegistryCount = {
  count: number
}

export type TokenCache = {
  value: string
  expires: number
}

export type NamespaceNode = {
  name: string
  path: string
  repository: boolean
  children: NamespaceNode[]
}

export type RegistryProvider = 'distribution' | 'dockerhub' | 'github'

export type RegistryProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    repository?: string
    reference?: string
  }>
}

export type Registry = {
  provider?: RegistryProvider
  namespace?: string
  trivyEnabled?: boolean
  id: string
  name: string
  url: string
  pullUrl: string
  username: string
  hasPassword: boolean
  readOnly: boolean
}

export type RegistryRecord = Omit<Registry, 'hasPassword'> & {
  revision?: string
  password: string
}

export type RegistryListing = {
  items: string[]
  dates?: Record<string, string | null>
}

export type RegistryPage = RegistryListing & {
  next: string | null
}

export type RegistryInput = {
  provider?: RegistryProvider
  namespace?: string
  name: string
  url: string
  pullUrl: string
  username: string
  password: string
  readOnly: boolean
}

export type RegistryPageInput = {
  repository?: string
  dates?: boolean
  last: string
  n: number
}

export type RegistryOptions = {
  method?: 'GET' | 'HEAD' | 'DELETE'
  scope?: string
  cache?: 'default' | 'reload'
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

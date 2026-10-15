export type Registry = {
  id: string
  name: string
  url: string
  pullUrl: string
  username: string
  hasPassword: boolean
  readOnly: boolean
}

export type RegistryRecord = Omit<Registry, 'hasPassword'> & {
  password: string
}

export type RegistryPage = {
  items: string[]
  next: string | null
}

export type RegistryInput = {
  name: string
  url: string
  pullUrl: string
  username: string
  password: string
  readOnly: boolean
}

export type RegistryPageInput = {
  repository?: string
  last: string
  n: number
}

export type RegistryOptions = {
  method?: 'GET' | 'DELETE'
  scope?: string
  cache?: 'default' | 'reload'
}

export type RegistryResponse = {
  text: string
  headers: Headers
}

export type RegistryRow = {
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

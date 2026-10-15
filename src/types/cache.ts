export type Entry = {
  registryId: string
  text: string
  headers: [string, string][]
  expires: number
  bytes: number
}

export type CacheState = {
  entries: Map<string, Entry>
  bytes: number
  generation: number
}

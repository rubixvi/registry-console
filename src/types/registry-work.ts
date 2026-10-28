import { type ImageManifest, type PlatformDetails } from '@/types/image'
import { type RegistryRecord } from '@/types/registry'

type Failure = {
  error: unknown
}

export type BatchState<T, R> = {
  items: T[]
  results: R[]
  cursor: number
  failure?: Failure
}

export type ImageInspection = {
  registry: RegistryRecord
  repository: string
  refresh: boolean
  digest: string
  blobs: Map<string, number>
  visited: Set<string>
  order: Map<string, number>
  waiting: (() => void)[]
  active: number
  platformDetails: PlatformDetails[]
  deadline: number
  config: unknown
  failure?: Failure
}

export type ImageQueue = {
  children: NonNullable<ImageManifest['manifests']>
  cursor: number
  depth: number
  fallbackPlatform: string
}

export type ImageVisitor = (
  state: ImageInspection,
  current: ImageManifest,
  digest: string,
  depth: number,
  platform?: string
) => Promise<void>

export type RegistrySearch = {
  registry: RegistryRecord
  architecture: string
  refresh: boolean
  deadline: number
  inspected: number
  dates?: Map<string, string | null>
}

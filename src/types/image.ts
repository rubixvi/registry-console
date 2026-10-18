import { type z } from 'zod'

import { type manifestSchema } from '@/lib/validation/image'

export type ImageMetadata = {
  isPrivate: boolean | null
  digest: string
  created: string | null
  pushedAt: string | null
  runnable: boolean
}

export type ImageDetails = {
  isPrivate?: boolean | null
  verified: boolean
  digest: string
  mediaType: string
  size: number
  created: string | null
  platformDetails: PlatformDetails[]
  platforms: string[]
  manifest: unknown
  config: unknown
  history: HistoryEntry[]
  labels: ImageLabel[]
}

export type ImageConfig = {
  created?: string
  os?: string
  architecture?: string
}

export type ImagePlatform = {
  os: string
  architecture: string
  variant?: string
}

export type ManifestEntry = {
  digest: string
  platform?: ImagePlatform
  annotations?: unknown
  artifactType?: string
}

export type PlatformDetails = {
  digest: string
  platform: string
  size: number
  created: string | null
}

export type ImageSummary = {
  created: string
  platform: string
  children: ManifestEntry[]
}

export type ImageManifest = z.infer<typeof manifestSchema>

export type ManifestResult = {
  manifest: ImageManifest
  digest: string
  verified: boolean
  mediaType: string
}

export type HistoryEntry = {
  step: number
  created: string | null
  command: string
  author: string | null
  comment: string | null
  emptyLayer: boolean
  size: number | null
  digest: string | null
}

export type ImageLabel = {
  name: string
  value: string
}

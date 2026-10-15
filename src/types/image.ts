import { type z } from 'zod'

import { type manifestSchema } from '@/lib/validation/image'

export type ImageDetails = {
  verified: boolean
  digest: string
  mediaType: string
  size: number
  platforms: string[]
  manifest: unknown
  config: unknown
  history: ImageHistoryEntry[]
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

export type ImageManifestEntry = {
  digest: string
  platform?: ImagePlatform
}

export type ImageSummary = {
  created: string
  platform: string
  children: ImageManifestEntry[]
}

export type ImageManifest = z.infer<typeof manifestSchema>

export type ImageHistoryEntry = {
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

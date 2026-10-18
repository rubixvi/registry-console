import 'server-only'

import { hubPath } from '@/lib/registry/dockerhub/hub-path'
import { type RegistryRecord } from '@/types/registry'

export function hubTags(registry: RegistryRecord, repository: string): string {
  return `${hubPath(registry, repository)}/tags`
}

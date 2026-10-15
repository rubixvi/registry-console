import { type ImageLabel } from '@/types/image'

const STANDARD_LABELS = [
  'org.opencontainers.image.title',
  'org.opencontainers.image.description',
  'org.opencontainers.image.version',
  'org.opencontainers.image.revision',
  'org.opencontainers.image.source',
  'org.opencontainers.image.url',
  'org.opencontainers.image.authors',
  'org.opencontainers.image.licenses',
  'maintainer',
]

export function imageLabels(config: unknown, custom: string[] = []): ImageLabel[] {
  if (!config || typeof config !== 'object' || !('config' in config)) return []

  const settings = config.config

  if (!settings || typeof settings !== 'object' || !('Labels' in settings)) return []

  const labels = settings.Labels

  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return []

  return [...new Set([...STANDARD_LABELS, ...custom])].flatMap((name) => {
    const value: unknown = Object.hasOwn(labels, name) ? Reflect.get(labels, name) : undefined

    return typeof value === 'string' && value.trim() ? [{ name, value }] : []
  })
}

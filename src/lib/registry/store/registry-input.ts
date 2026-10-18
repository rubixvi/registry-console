import 'server-only'

import { randomUUID } from 'node:crypto'

import { validateUrl } from '@/lib/registry/allowlist'
import { hubSettings } from '@/lib/registry/dockerhub-settings'
import { encryptSecret } from '@/lib/security/crypto'
import { type RegistryInput, type RegistryRow } from '@/types/registry'

export function registryInput(id: string, input: RegistryInput): RegistryRow {
  const url = validateUrl(input.url, input.provider)
  const password = encryptSecret(input.password)
  const settings = hubSettings(input, url)

  return {
    id,
    name: input.name,
    url,
    pull_url: input.pullUrl,
    username: input.username,
    password,
    read_only: Number(input.readOnly),
    provider: settings.provider,
    namespace: settings.namespace,
    revision: randomUUID(),
  }
}

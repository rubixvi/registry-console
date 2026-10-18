import 'server-only'

import { randomUUID } from 'node:crypto'

import { insertRegistry, markSeeded, registrySeeded } from '@/lib/database/registry'
import { transaction } from '@/lib/database/transaction'
import { validateUrl } from '@/lib/registry/allowlist'
import { decryptSecret } from '@/lib/security/crypto'

export function seedRegistry(): void {
  const url = process.env.REGISTRY_URL

  if (!url || registrySeeded()) return

  const password = process.env.REGISTRY_PASSWORD_ENCRYPTED || ''

  decryptSecret(password)

  transaction(() => {
    if (registrySeeded()) return

    insertRegistry({
      id: randomUUID(),
      name: process.env.REGISTRY_NAME || 'Primary registry',
      url: validateUrl(url),
      pull_url: '',
      username: process.env.REGISTRY_USERNAME || '',
      password,
      read_only: Number(process.env.REGISTRY_READ_ONLY === 'true'),
      provider: 'distribution',
      namespace: '',
      revision: randomUUID(),
    })
    markSeeded()
  })
}

import 'server-only'

import { createDecipheriv } from 'node:crypto'

import { ALGORITHM, DATA_PATTERN, IV_PATTERN, TAG_PATTERN } from '@/lib/security/crypto'
import { secretKeys } from '@/lib/security/keys'

export function decryptSecret(value: string): string {
  if (!value) return ''

  const parts = value.split('.')
  const version = parts[0]
  const id = version === 'v2' ? parts[1] : undefined
  const [iv, tag, data] = parts.slice(version === 'v2' ? 2 : 1)

  if (
    (version !== 'v1' && version !== 'v2') ||
    parts.length !== (version === 'v2' ? 5 : 4) ||
    (version === 'v2' && (!id || !/^[a-zA-Z0-9_-]{1,32}$/.test(id))) ||
    !iv ||
    !tag ||
    !data ||
    !IV_PATTERN.test(iv) ||
    !TAG_PATTERN.test(tag) ||
    !DATA_PATTERN.test(data)
  ) {
    throw new Error('Invalid encrypted secret')
  }

  const keys = secretKeys()
  const candidates = id ? [keys.get(id)].filter((key) => key !== undefined) : [...keys.values()]

  for (const key of candidates) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))

      if (id) decipher.setAAD(Buffer.from(`registry-console:${version}:${id}`))
      decipher.setAuthTag(Buffer.from(tag, 'hex'))

      return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString(
        'utf8'
      )
    } catch {}
  }

  throw new Error('The encrypted secret could not be authenticated with the configured keys.')
}

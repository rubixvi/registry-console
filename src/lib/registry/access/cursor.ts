import 'server-only'

import { registryCacheIdentity } from '@/lib/registry/identity'
import { privateAccess } from '@/lib/security/access'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { fingerprint } from '@/lib/security/fingerprint'
import { type RegistryPageInput, type RegistryRecord } from '@/types/registry'

export function readCursor(registry: RegistryRecord, input: RegistryPageInput): RegistryPageInput {
  if (privateAccess() || input.repository || !input.last) return input

  try {
    const cursor = JSON.parse(decryptSecret(input.last))
    const key = fingerprint('public-catalogue', [registryCacheIdentity(registry), input.n])

    if (
      cursor.key !== key ||
      typeof cursor.last !== 'string' ||
      cursor.last.length > 255 ||
      !Number.isSafeInteger(cursor.expires) ||
      cursor.expires <= Date.now()
    )
      throw new Error('Expired cursor')

    return { ...input, last: cursor.last }
  } catch {
    throw new AppError(400, 'Invalid or expired repository page cursor.')
  }
}

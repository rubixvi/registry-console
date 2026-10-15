import { AppError } from '@/lib/security/error'
import { type AuthChallenge } from '@/types/auth'

const MAX_CHALLENGE_LENGTH = 4096

export function parseChallenge(header: string | null): AuthChallenge | null {
  if (!header || header.length > MAX_CHALLENGE_LENGTH) {
    return null
  }

  if (!/^Bearer\s/i.test(header)) {
    return null
  }

  const fields: Record<string, string> = {}

  for (const match of header.matchAll(/([a-z_]+)="([^"\r\n]*)"/gi)) {
    const [, name, value] = match
    fields[name.toLowerCase()] = value
  }

  if (!fields.realm) {
    throw new AppError(502, 'Registry returned an invalid authentication challenge.')
  }

  return {
    realm: fields.realm,
    service: fields.service || '',
  }
}

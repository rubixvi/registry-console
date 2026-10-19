import 'server-only'

import { keyedFingerprint } from '@/lib/security/fingerprint'
import { passwordHashSchema, usersSchema } from '@/lib/validation/auth'
import { type User } from '@/types/auth'

export function users(): User[] {
  const configuredUsers = process.env.AUTH_USERS_JSON

  let value: unknown = [
    {
      id: process.env.AUTH_USER_ID,
      email: process.env.AUTH_EMAIL || undefined,
      username: process.env.AUTH_USERNAME,
      passwordHash: process.env.AUTH_PASSWORD_HASH,
      role: 'admin',
    },
  ]

  if (configuredUsers) {
    try {
      value = JSON.parse(configuredUsers)
    } catch {
      throw new Error('AUTH_USERS_JSON must contain valid JSON.')
    }
  }

  const parsed = usersSchema.parse(value)
  const usernames = new Set(parsed.map((user) => user.username))

  if (usernames.size !== parsed.length) {
    throw new Error('Usernames must be unique.')
  }

  const ids = parsed.flatMap((user) => (user.id ? [user.id] : []))
  const emails = parsed.flatMap((user) => (user.email ? [user.email] : []))

  if (new Set(emails).size !== emails.length) {
    throw new Error('Account emails must be unique.')
  }

  if (new Set(ids).size !== ids.length) {
    throw new Error('User IDs must be unique.')
  }

  const hasAdmin = parsed.some((user) => user.role === 'admin')

  if (!hasAdmin) {
    throw new Error('At least one admin is required.')
  }

  return parsed
}

export function userFingerprint(user: User): string {
  const provider = user.authProvider ?? 'local'
  const passwordHash =
    provider === 'local' ? passwordHashSchema.parse(user.passwordHash) : undefined

  return keyedFingerprint('user-session', {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    provider,
    passwordHash,
    directory:
      provider === 'ldap'
        ? {
            source: user.directory?.source,
            subject: user.directory?.subject,
            url: process.env.LDAP_URL,
            base: process.env.LDAP_BASE_DN,
            filter: process.env.LDAP_USER_FILTER,
          }
        : undefined,
  })
}

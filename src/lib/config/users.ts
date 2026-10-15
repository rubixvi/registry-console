import 'server-only'

import { createHash } from 'node:crypto'

import { usersSchema } from '@/lib/validation/auth'
import { type User } from '@/types/auth'

export function users(): User[] {
  const configuredUsers = process.env.AUTH_USERS_JSON

  let value: unknown = [
    {
      id: process.env.AUTH_USER_ID,
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

  if (new Set(ids).size !== ids.length) {
    throw new Error('User IDs must be unique.')
  }

  const hasAdministrator = parsed.some((user) => user.role === 'admin')

  if (!hasAdministrator) {
    throw new Error('At least one administrator is required.')
  }

  return parsed
}

export function userFingerprint(user: User): string {
  return createHash('sha256').update(JSON.stringify(user)).digest('hex')
}

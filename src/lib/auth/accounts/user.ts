import 'server-only'

import { directoryUser } from '@/lib/auth/directory/user'
import { users } from '@/lib/config/users'
import { type User } from '@/types/auth'

export function findUser(username: string): User | undefined {
  const config = users()

  const local = config.find((user) => user.username.toLowerCase() === username.toLowerCase())

  return local ? (local.username === username ? local : undefined) : directoryUser(username)
}

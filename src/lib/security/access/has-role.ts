import 'server-only'

import { type Role } from '@/types/auth'

export function hasRole(role: Role, required: Role): boolean {
  const levels = { viewer: 0, member: 1, admin: 2 }

  return levels[role] >= levels[required]
}

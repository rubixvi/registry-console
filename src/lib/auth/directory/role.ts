import 'server-only'

import { type Role } from '@/types/auth'

export function directoryRole(groups: string[], mapping: Record<Role, string[]>): Role | null {
  const normal = (value: string) => {
    return value.trim().toLowerCase()
  }
  const memberships = new Set(groups.map(normal))

  for (const role of ['admin', 'member', 'viewer'] as const) {
    if (mapping[role].some((group) => memberships.has(normal(group)))) return role
  }

  return null
}

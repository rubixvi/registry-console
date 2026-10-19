import { type Role, type User } from '@/types/auth'

export type DirectoryProfile = {
  subject: string
  username: string
  email?: string
  role: Role
}

export type DirectoryRow = {
  id: string
  source: string
  subject: string
  username: string
  email: string
  role: Role
  policy: string
  checked: number
  active: number
}

export type DirectoryUser = User & { directory: { source: string; subject: string } }

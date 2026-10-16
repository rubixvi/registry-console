export type Role = 'admin' | 'viewer'

export type User = {
  id?: string
  username: string
  role: Role
  passwordHash?: string
  authProvider?: 'local' | 'ldap'
}

export type Identity = {
  username: string
  role: Role
}

export type AuthChallenge = {
  realm: string
  service: string
}

export type SessionRow = {
  id: string
  username: string
  fingerprint: string
  expires: number
}

export type Session = {
  token: string
  expires: number
}

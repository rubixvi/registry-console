export type Role = 'admin' | 'member' | 'viewer'
export type Providers = 'local' | 'ldap' | 'sso'

export type User = {
  id?: string
  email?: string
  username: string
  role: Role
  passwordHash?: string
  authProvider?: Providers
  directory?: {
    source: string
    subject: string
  }
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

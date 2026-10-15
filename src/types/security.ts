export type AuthRequest = {
  id: string
  purpose: Purpose
  username: string
  fingerprint: string
  session_id: string
  value: string
  expires: number
  attempts: number
}

export type SecurityAccount = {
  username: string
  account_id: string
  configured_id: string
}

export type AuthenticatorRow = {
  username: string
  fingerprint: string
  secret: string
  last_step: number
  recovery: string
}

export type Purpose =
  | 'passkey-login'
  | 'passkey-register'
  | 'two-factor'
  | 'security'
  | 'totp-setup'

export type PasskeySummary = {
  id: string
  name: string
  created: string
  lastUsed: string | null
}

export type PasskeyRow = {
  id: string
  username: string
  fingerprint: string
  user_id: string
  public_key: string
  counter: number
  transports: string
  name: string
  created: string
  last_used: string | null
}

export type SecurityStatus = {
  passkeys: PasskeySummary[]
  totpEnabled: boolean
  recoveryRemaining: number
}

export type TotpSetup = {
  secret: string
  qrCode: string
}

export type LoginResult = {
  success?: boolean
  requiresTwoFactor?: boolean
}

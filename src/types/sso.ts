import { type z } from 'zod'

import { type providerSchema, type ssoState } from '@/lib/validation/sso'

export type SsoProfile = {
  issuer: string
  subject: string
  email: string
}

export type SsoLink = {
  provider: string
  issuer: string
  subject: string
  account_id: string
}

export type SsoButton = {
  id: string
  name: string
}

export type Provider = z.infer<typeof providerSchema>
export type SsoState = z.infer<typeof ssoState>

import { z } from 'zod'

const clientId = z.string().trim().max(2048).default('')
const secret = z.string().max(4096).default('')
const issuer = z.string().trim().max(2048).default('')
const name = z.string().trim().max(64).default('')
const origins = z.string().max(16_384).default('')
const authMethod = z.enum(['post', 'basic']).default('post')

export const ssoEnv = z.object({
  AUTHENTIK_ID: clientId,
  AUTHENTIK_SECRET: secret,
  AUTHENTIK_ISSUER: issuer,
  AUTHENTIK_NAME: name,
  AUTHENTIK_ORIGINS: origins,
  AUTHENTIK_AUTH_METHOD: authMethod,
  GITHUB_ID: clientId,
  GITHUB_SECRET: secret,
  GITHUB_NAME: name,
  GITHUB_ORIGINS: origins,
  GITHUB_AUTH_METHOD: authMethod,
  GOOGLE_ID: clientId,
  GOOGLE_SECRET: secret,
  GOOGLE_NAME: name,
  GOOGLE_ORIGINS: origins,
  GOOGLE_AUTH_METHOD: authMethod,
  ZITADEL_ID: clientId,
  ZITADEL_SECRET: secret,
  ZITADEL_ISSUER: issuer,
  ZITADEL_NAME: name,
  ZITADEL_ORIGINS: origins,
  ZITADEL_AUTH_METHOD: authMethod,
  KEYCLOAK_ID: clientId,
  KEYCLOAK_SECRET: secret,
  KEYCLOAK_ISSUER: issuer,
  KEYCLOAK_NAME: name,
  KEYCLOAK_ORIGINS: origins,
  KEYCLOAK_AUTH_METHOD: authMethod,
})

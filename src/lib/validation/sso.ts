import { z } from 'zod'

export const providerName = z.enum(['authentik', 'github', 'google', 'zitadel', 'keycloak'])
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((value) => value.toLowerCase())

export const providerSchema = z
  .object({
    id: providerName,
    name: z.string().trim().min(1).max(64).optional(),
    issuer: z.url().max(2048).optional(),
    clientId: z.string().min(1).max(2048),
    clientSecret: z.string().min(1).max(4096),
    origins: z.array(z.url().max(2048)).max(8).default([]),
    authMethod: z.enum(['post', 'basic']).default('post'),
  })
  .strict()

export const providersSchema = z.array(providerSchema).max(5)

export const ssoInput = z.object({ action: z.enum(['login', 'verify']).default('login') }).strict()

export const ssoState = z.object({
  provider: providerName,
  state: z.string().min(32).max(128),
  verifier: z.string().min(43).max(128),
  nonce: z.string().min(32).max(128),
  action: z.enum(['login', 'verify']),
  session: z.string().max(128),
  username: z.string().max(64),
  fingerprint: z.string().max(128),
})

export const verifiedEmail = z.object({
  sub: z.string().min(1).max(512),
  email: emailSchema,
  email_verified: z.literal(true),
})

export const githubUser = z.object({ id: z.number().int().positive().safe() })
export const githubEmails = z
  .array(z.object({ email: emailSchema, verified: z.boolean(), primary: z.boolean() }))
  .max(100)

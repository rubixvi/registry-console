import { z } from 'zod'

export const verificationInput = z
  .object({
    password: z.string().max(1024).default(''),
    code: z.string().trim().max(64).optional(),
  })
  .strict()

export const codeInput = z
  .object({
    code: z.string().trim().min(1).max(64),
  })
  .strict()

export const passkeyIdInput = z
  .object({
    id: z.string().min(1).max(2048),
  })
  .strict()

export const passkeyRegistrationInput = z
  .object({
    name: z.string().trim().min(1).max(64),
    credential: z
      .object({
        id: z.string().min(1).max(2048),
        rawId: z.string().min(1).max(2048),
        type: z.literal('public-key'),
        response: z
          .object({
            clientDataJSON: z.string().max(8192),
            attestationObject: z.string().max(65536),
            transports: z
              .array(z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']))
              .max(10)
              .optional(),
          })
          .loose(),
        clientExtensionResults: z.object({}).loose(),
        authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
      })
      .loose(),
  })
  .strict()

export const passkeyAuthenticationInput = z
  .object({
    id: z.string().min(1).max(2048),
    rawId: z.string().min(1).max(2048),
    type: z.literal('public-key'),
    response: z
      .object({
        clientDataJSON: z.string().max(8192),
        authenticatorData: z.string().max(8192),
        signature: z.string().max(4096),
        userHandle: z.string().max(128).optional(),
      })
      .loose(),
    clientExtensionResults: z.object({}).loose(),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  })
  .loose()

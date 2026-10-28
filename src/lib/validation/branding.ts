import { z } from 'zod'

const logoPath = z
  .string()
  .max(256)
  .refine(
    (path) =>
      path === '' ||
      /^\/[a-zA-Z0-9/_-]+\.png$/.test(path) ||
      /^\/api\/branding\/logo\.png\?v=[a-f0-9]{64}$/.test(path)
  )

export const brandingInput = z
  .object({
    name: z.string().trim().min(1).max(64),
    footer: z.string().trim().max(160),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logoPath,
  })
  .strict()

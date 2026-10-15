import { z } from 'zod'

export const brandingInput = z
  .object({
    name: z.string().trim().min(1).max(64),
    footer: z.string().trim().max(160),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    logoPath: z
      .string()
      .max(256)
      .refine(
        (v) =>
          v === '' ||
          /^\/[a-zA-Z0-9/_-]+\.png$/.test(v) ||
          /^\/api\/branding\/logo\.png\?v=[a-f0-9]{64}$/.test(v)
      ),
  })
  .strict()

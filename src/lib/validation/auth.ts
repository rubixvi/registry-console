import { z } from 'zod'

import { emailSchema } from '@/lib/validation/sso'

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

export const passwordHashSchema = z
  .string()
  .regex(/^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/)

export const userSchema = z
  .object({
    id: z.string().uuid().optional(),
    email: emailSchema.optional(),
    username: z.string().regex(/^[a-zA-Z0-9_.@-]{1,64}$/),
    passwordHash: passwordHashSchema.optional(),
    authProvider: z.enum(['local', 'ldap', 'sso']).optional(),
    role: z.enum(['admin', 'member', 'viewer']),
  })
  .superRefine((user, context) => {
    const provider = user.authProvider ?? 'local'

    if (provider === 'local' && !user.passwordHash) {
      context.addIssue({
        code: 'custom',
        path: ['passwordHash'],
        message: 'Local accounts require a password hash.',
      })
    }

    if (provider !== 'local' && user.passwordHash) {
      context.addIssue({
        code: 'custom',
        path: ['passwordHash'],
        message: 'External accounts must not define a local password.',
      })
    }

    if (provider === 'sso' && !user.email) {
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'SSO accounts require an email.',
      })
    }
  })

export const usersSchema = z.array(userSchema).min(1).max(50)

export const loginInput = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(1024),
  })
  .strict()

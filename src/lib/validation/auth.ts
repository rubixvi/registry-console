import { z } from 'zod'

export const passwordHashSchema = z
  .string()
  .regex(/^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/)

export const userSchema = z
  .object({
    id: z.string().uuid().optional(),
    username: z.string().regex(/^[a-zA-Z0-9_.@-]{1,64}$/),
    passwordHash: passwordHashSchema.optional(),
    authProvider: z.enum(['local', 'ldap']).optional(),
    role: z.enum(['admin', 'viewer']),
  })
  .superRefine((user, context) => {
    if (user.authProvider !== 'ldap' && !user.passwordHash) {
      context.addIssue({
        code: 'custom',
        path: ['passwordHash'],
        message: 'Local accounts require a password hash.',
      })
    }

    if (user.authProvider === 'ldap' && user.passwordHash) {
      context.addIssue({
        code: 'custom',
        path: ['passwordHash'],
        message: 'LDAP accounts must not define a local password.',
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

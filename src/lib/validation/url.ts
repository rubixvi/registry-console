import { z } from 'zod'

export const pullUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true

    try {
      const url = new URL(value)
      const protocol = url.protocol === 'http:' || url.protocol === 'https:'

      return (
        protocol &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/'
      )
    } catch {
      return false
    }
  }, 'Use an HTTP or HTTPS origin without credentials, a path, or query parameters.')
  .transform((value) => (value ? new URL(value).origin : ''))

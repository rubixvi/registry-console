import { isIP } from 'node:net'
import { z } from 'zod'

const proxyRange = z
  .string()
  .min(1)
  .max(49)
  .refine((value) => {
    const [address, prefix, extra] = value.split('/')
    const version = isIP(address)

    if (!version || address.includes('%') || extra !== undefined) return false
    if (prefix === undefined) return true
    if (!/^(0|[1-9][0-9]{0,2})$/.test(prefix)) return false

    return Number(prefix) <= (version === 4 ? 32 : 128)
  }, 'Use an IPv4 or IPv6 address or CIDR range.')

export const proxyList = z
  .string()
  .max(16_384)
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  )
  .pipe(z.array(proxyRange).max(256))
  
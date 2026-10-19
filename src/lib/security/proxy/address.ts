import 'server-only'

import { isIP, SocketAddress } from 'node:net'

export function ipAddress(value: string): string | undefined {
  const version = isIP(value)

  if (!version || value.includes('%')) return undefined

  const address = new SocketAddress({
    address: value,
    family: version === 4 ? 'ipv4' : 'ipv6',
  }).address

  return address.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '')
}

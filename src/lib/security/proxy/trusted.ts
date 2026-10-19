import 'server-only'

import { BlockList, isIP } from 'node:net'

import { env } from '@/lib/config/env'

let source = ''
let ranges = new BlockList()

export function trustedProxy(address: string): boolean {
  const entries = env().TRUSTED_PROXIES
  const current = entries.join(',')

  if (source !== current) {
    const next = new BlockList()

    for (const entry of entries) {
      const [network, prefix] = entry.split('/')
      const family = isIP(network) === 4 ? 'ipv4' : 'ipv6'

      if (prefix === undefined) next.addAddress(network, family)
      else next.addSubnet(network, Number(prefix), family)
    }

    ranges = next
    source = current
  }

  const version = isIP(address)

  return version !== 0 && ranges.check(address, version === 4 ? 'ipv4' : 'ipv6')
}

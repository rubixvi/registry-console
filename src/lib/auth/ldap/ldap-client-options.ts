import 'server-only'

import { connect } from 'node:net'
import { connect as connectTls } from 'node:tls'
import { type ClientOptions } from 'ldapts'

import { AppError } from '@/lib/security/error'

export function ldapClientOptions(url: URL): ClientOptions {
  let connected = false

  const tlsOptions = {
    minVersion: 'TLSv1.2' as const,
    rejectUnauthorized: true,
    servername: url.hostname,
  }

  return {
    url: url.toString(),
    timeout: 8_000,
    connectTimeout: 5_000,
    ...(url.protocol === 'ldaps:' ? { tlsOptions } : {}),
    strictDN: true,
    autoRebind: false,
    createConnection: ((...args: Parameters<typeof connect>) => {
      if (connected) {
        throw new AppError(503, 'Directory connection was interrupted. Try signing in again.')
      }

      connected = true

      return connect(...args)
    }) as typeof connect,
    createSecureConnection: ((...args: Parameters<typeof connectTls>) => {
      const socket = connectTls(...args)
      const timer = setTimeout(() => {
        socket.destroy(new Error('Directory TLS handshake timed out.'))
      }, 5_000)

      socket.once('secureConnect', () => clearTimeout(timer))
      socket.once('close', () => clearTimeout(timer))

      return socket
    }) as typeof connectTls,
  }
}

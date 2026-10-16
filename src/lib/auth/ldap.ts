import 'server-only'

import { connect } from 'node:net'
import { connect as connectTls } from 'node:tls'
import { Client, type ClientOptions, InvalidCredentialsError } from 'ldapts'

import { env } from '@/lib/config/env'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'

export function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (character) => {
    return `\\${character.charCodeAt(0).toString(16).padStart(2, '0')}`
  })
}

export function ldapConfiguration() {
  const config = env()

  if (config.LDAP_ENABLED !== 'true') {
    throw new AppError(503, 'Directory sign-in is disabled.')
  }

  let url: URL

  try {
    url = new URL(config.LDAP_URL)
  } catch {
    throw new AppError(503, 'Directory sign-in is not configured correctly.')
  }

  if (
    !['ldap:', 'ldaps:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '' && url.pathname !== '/') ||
    (url.protocol === 'ldap:' && config.LDAP_STARTTLS !== 'true') ||
    !config.LDAP_BASE_DN ||
    !config.LDAP_BIND_DN ||
    !config.LDAP_BIND_PASSWORD_ENCRYPTED ||
    config.LDAP_USER_FILTER.split('{username}').length !== 2
  ) {
    throw new AppError(503, 'Directory sign-in requires LDAPS or StartTLS and a search account.')
  }

  return { config, url }
}

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

export async function verifyLdapPassword(username: string, password: string): Promise<boolean> {
  if (!password || password.includes('\0')) {
    return false
  }

  const { config, url } = ldapConfiguration()
  const client = new Client(ldapClientOptions(url))

  try {
    if (url.protocol === 'ldap:') {
      await client.startTLS({
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        servername: url.hostname,
      })
    }

    const bindPassword = decryptSecret(config.LDAP_BIND_PASSWORD_ENCRYPTED)

    if (!bindPassword) {
      throw new AppError(503, 'Directory search credentials are unavailable.')
    }

    await client.bind(config.LDAP_BIND_DN, bindPassword)

    const { searchEntries, searchReferences } = await client.search(config.LDAP_BASE_DN, {
      scope: 'sub',
      derefAliases: 'never',
      filter: config.LDAP_USER_FILTER.replace('{username}', escapeLdapFilter(username)),
      attributes: ['1.1'],
      sizeLimit: 2,
      timeLimit: 5,
    })

    if (searchReferences.length || searchEntries.length !== 1 || !searchEntries[0].dn) {
      return false
    }

    try {
      await client.bind(searchEntries[0].dn, password)
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return false
      }

      throw error
    }

    return true
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(503, 'Directory sign-in is unavailable. Contact an administrator.')
  } finally {
    await client.unbind().catch(() => undefined)
  }
}

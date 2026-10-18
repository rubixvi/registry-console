import 'server-only'

import { Client, InvalidCredentialsError } from 'ldapts'

import { escapeLdapFilter } from '@/lib/auth/ldap/escape-ldap-filter'
import { ldapClientOptions } from '@/lib/auth/ldap/ldap-client-options'
import { ldapConfiguration } from '@/lib/auth/ldap/ldap-configuration'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'

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

import 'server-only'

import { InvalidCredentialsError } from 'ldapts'

import { directoryProfile } from '@/lib/auth/directory/profile'
import { provisionDirectory } from '@/lib/auth/directory/provision'
import { withDirectory } from '@/lib/auth/directory/with-directory'
import { escapeLdapFilter } from '@/lib/auth/ldap'
import { decryptSecret } from '@/lib/security/crypto'
import { createGate } from '@/lib/security/gate'
import { type User } from '@/types/auth'

const enter = createGate(2)

export async function authenticateDirectory(
  username: string,
  password: string
): Promise<User | null> {
  if (!password || password.includes('\0')) return null

  const release = await enter()

  try {
    return await withDirectory(async (client, settings) => {
      const filter = settings.config.LDAP_USER_FILTER.replace(
        '{username}',
        escapeLdapFilter(username)
      )
      const profile = await directoryProfile(client, settings, filter)

      if (!profile) return null

      try {
        await client.bind(profile.dn, password)
      } catch (error) {
        if (error instanceof InvalidCredentialsError) return null
        throw error
      }

      await client.bind(
        settings.config.LDAP_BIND_DN,
        decryptSecret(settings.config.LDAP_BIND_PASSWORD_ENCRYPTED)
      )

      const verified = await directoryProfile(client, settings, filter)

      if (!verified || verified.subject !== profile.subject) return null

      return provisionDirectory(verified, settings)
    })
  } finally {
    release()
  }
}

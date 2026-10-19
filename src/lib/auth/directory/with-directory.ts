import 'server-only'

import { Client } from 'ldapts'

import { directoryConfig } from '@/lib/auth/directory/config'
import { ldapClientOptions } from '@/lib/auth/ldap'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'

export async function withDirectory<T>(
  task: (client: Client, settings: ReturnType<typeof directoryConfig>) => Promise<T>
): Promise<T> {
  const settings = directoryConfig()
  const client = new Client(ldapClientOptions(settings.url))

  try {
    if (settings.url.protocol === 'ldap:') {
      await client.startTLS({
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        servername: settings.url.hostname,
      })
    }

    const secret = decryptSecret(settings.config.LDAP_BIND_PASSWORD_ENCRYPTED)

    if (!secret) throw new AppError(503, 'Directory search credentials are unavailable.')

    await client.bind(settings.config.LDAP_BIND_DN, secret)

    return await task(client, settings)
  } catch (error) {
    if (error instanceof AppError) throw error

    throw new AppError(503, 'Directory sign-in is unavailable. Contact an admin.')
  } finally {
    await client.unbind().catch(() => undefined)
  }
}

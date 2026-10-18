import 'server-only'

import { env } from '@/lib/config/env'
import { AppError } from '@/lib/security/error'

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

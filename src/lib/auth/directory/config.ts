import 'server-only'

import { createHash } from 'node:crypto'
import { FilterParser } from 'ldapts'

import { ldapConfiguration } from '@/lib/auth/ldap'
import { AppError } from '@/lib/security/error'

export function directoryConfig() {
  const { config, url } = ldapConfiguration()
  const groups = {
    admin: config.LDAP_ADMIN_GROUPS.split(/[;\n]/)
      .map((group) => group.trim())
      .filter(Boolean),
    member: config.LDAP_MEMBER_GROUPS.split(/[;\n]/)
      .map((group) => group.trim())
      .filter(Boolean),
    viewer: config.LDAP_VIEWER_GROUPS.split(/[;\n]/)
      .map((group) => group.trim())
      .filter(Boolean),
  }

  if (
    !Object.values(groups).some((list) => list.length) ||
    Object.values(groups).some((list) => list.length > 64)
  ) {
    throw new AppError(
      503,
      'Configure at least one LDAP role group, with at most 64 groups per role.'
    )
  }

  try {
    FilterParser.parseString(config.LDAP_USER_FILTER.replace('{username}', 'user'))
    if (config.LDAP_ACCESS_FILTER) FilterParser.parseString(config.LDAP_ACCESS_FILTER)
    if (config.LDAP_ACCESS_FILTER.includes('{')) throw new Error('Invalid access filter')
    if (config.LDAP_GROUP_BASE_DN) {
      if (!/\{(?:dn|username)\}/.test(config.LDAP_GROUP_FILTER))
        throw new Error('Missing group placeholder')
      FilterParser.parseString(
        config.LDAP_GROUP_FILTER.replaceAll('{dn}', 'user').replaceAll('{username}', 'user')
      )
    }
  } catch {
    throw new AppError(503, 'Configure valid LDAP user, access and group search filters.')
  }

  const source = createHash('sha256')
    .update(
      JSON.stringify([url.toString(), config.LDAP_BASE_DN, config.LDAP_ID_ATTRIBUTE.toLowerCase()])
    )
    .digest('hex')
  const policy = createHash('sha256')
    .update(
      JSON.stringify(
        Object.fromEntries(Object.entries(config).filter(([name]) => name.startsWith('LDAP_')))
      )
    )
    .digest('hex')

  return { config, url, groups, source, policy }
}

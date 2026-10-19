import 'server-only'

import { type Client } from 'ldapts'

import { directoryAttribute } from '@/lib/auth/directory/attribute'
import { type directoryConfig } from '@/lib/auth/directory/config'
import { directoryRole } from '@/lib/auth/directory/role'
import { escapeLdapFilter } from '@/lib/auth/ldap'
import { userSchema } from '@/lib/validation/auth'
import { emailSchema } from '@/lib/validation/sso'
import { type DirectoryProfile } from '@/types/directory'

export async function directoryProfile(
  client: Client,
  settings: ReturnType<typeof directoryConfig>,
  filter: string
): Promise<(DirectoryProfile & { dn: string }) | null> {
  const { config } = settings
  const result = await client.search(config.LDAP_BASE_DN, {
    scope: 'sub',
    derefAliases: 'never',
    sizeLimit: 2,
    timeLimit: 5,
    filter: config.LDAP_ACCESS_FILTER ? `(&${filter}${config.LDAP_ACCESS_FILTER})` : filter,
    attributes: [
      ...new Set([
        config.LDAP_ID_ATTRIBUTE,
        config.LDAP_USERNAME_ATTRIBUTE,
        config.LDAP_EMAIL_ATTRIBUTE,
        config.LDAP_GROUP_ATTRIBUTE,
        'userAccountControl',
        'msDS-User-Account-Control-Computed',
        'accountExpires',
        'pwdAccountLockedTime',
      ]),
    ],
    explicitBufferAttributes:
      config.LDAP_ID_ATTRIBUTE.toLowerCase() === 'objectguid' ? [config.LDAP_ID_ATTRIBUTE] : [],
  })

  if (result.searchReferences.length || result.searchEntries.length !== 1) return null

  const entry = result.searchEntries[0]
  const ids = directoryAttribute(entry, config.LDAP_ID_ATTRIBUTE)
  const names = directoryAttribute(entry, config.LDAP_USERNAME_ATTRIBUTE)
  const emails = directoryAttribute(entry, config.LDAP_EMAIL_ATTRIBUTE)
  const controls = Number(directoryAttribute(entry, 'userAccountControl')[0] ?? 0)
  const computed = Number(directoryAttribute(entry, 'msDS-User-Account-Control-Computed')[0] ?? 0)
  const expires = String(directoryAttribute(entry, 'accountExpires')[0] ?? '0')

  if (
    !entry.dn ||
    ids.length !== 1 ||
    names.length !== 1 ||
    emails.length > 1 ||
    !Number.isInteger(controls) ||
    !Number.isInteger(computed) ||
    controls & 2 ||
    computed & 16 ||
    directoryAttribute(entry, 'pwdAccountLockedTime').some(
      (value) => String(value) === '000001010000Z'
    ) ||
    expires.length > 20 ||
    !/^\d+$/.test(expires)
  )
    return null

  if (
    expires !== '0' &&
    expires !== '9223372036854775807' &&
    BigInt(expires) / 10_000n - 11_644_473_600_000n <= BigInt(Date.now())
  )
    return null

  if (config.LDAP_ID_ATTRIBUTE.toLowerCase() === 'entryuuid') {
    if (typeof ids[0] !== 'string' || !userSchema.shape.id.safeParse(ids[0]).success) return null
    ids[0] = ids[0].toLowerCase()
  }

  if (
    config.LDAP_ID_ATTRIBUTE.toLowerCase() === 'objectguid' &&
    (!Buffer.isBuffer(ids[0]) || ids[0].length !== 16)
  )
    return null

  const subject = Buffer.isBuffer(ids[0])
    ? `b:${ids[0].toString('hex')}`
    : `s:${String(ids[0]).trim()}`
  const username = String(names[0])
  const email = emails.length ? emailSchema.safeParse(String(emails[0])) : undefined

  if (
    subject.length < 3 ||
    subject.length > 1024 ||
    subject.includes('\0') ||
    !userSchema.shape.username.safeParse(username).success ||
    (email && !email.success)
  )
    return null

  const memberships = directoryAttribute(entry, config.LDAP_GROUP_ATTRIBUTE).map(String)

  if (config.LDAP_GROUP_BASE_DN) {
    const groups = await client.search(config.LDAP_GROUP_BASE_DN, {
      scope: 'sub',
      derefAliases: 'never',
      sizeLimit: 1000,
      timeLimit: 5,
      attributes: ['1.1'],
      filter: config.LDAP_GROUP_FILTER.replaceAll('{dn}', escapeLdapFilter(entry.dn)).replaceAll(
        '{username}',
        escapeLdapFilter(username)
      ),
    })

    if (groups.searchReferences.length || groups.searchEntries.length >= 1000) return null

    memberships.push(...groups.searchEntries.map((group) => group.dn))
  }

  if (memberships.length > 1000) return null

  const role = directoryRole(memberships, settings.groups)

  return role
    ? { dn: entry.dn, subject, username, ...(email?.success ? { email: email.data } : {}), role }
    : null
}

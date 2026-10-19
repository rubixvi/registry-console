import { z } from 'zod'

const attribute = z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/)
const groups = z.string().max(16_384).default('')

export const ldapEnv = z.object({
  LDAP_ID_ATTRIBUTE: attribute.default('entryUUID'),
  LDAP_USERNAME_ATTRIBUTE: attribute.default('uid'),
  LDAP_EMAIL_ATTRIBUTE: attribute.default('mail'),
  LDAP_GROUP_ATTRIBUTE: attribute.default('memberOf'),
  LDAP_GROUP_BASE_DN: z.string().max(2048).default(''),
  LDAP_GROUP_FILTER: z.string().max(2048).default('(member={dn})'),
  LDAP_ACCESS_FILTER: z.string().max(2048).default(''),
  LDAP_ADMIN_GROUPS: groups,
  LDAP_MEMBER_GROUPS: groups,
  LDAP_VIEWER_GROUPS: groups,
  LDAP_CHECK_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
})

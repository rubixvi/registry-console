import { z } from 'zod'

import { keyName } from '@/lib/validation/keys'
import { ldapEnv } from '@/lib/validation/ldap'
import { proxyList } from '@/lib/validation/proxy'
import { ssoEnv } from '@/lib/validation/sso-env'
import { pullUrlSchema } from '@/lib/validation/url'
import { TAG_ORDERS } from '@/utils/sort-tags'

const flag = z.enum(['true', 'false']).default('false')

const customLabels = z
  .string()
  .max(4096)
  .default('')
  .transform((value) => [
    ...new Set(
      value
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean)
    ),
  ])
  .pipe(z.array(z.string().min(1).max(256)).max(32))

export const envSchema = z.object({
  ...ssoEnv.shape,
  ...ldapEnv.shape,

  APP_ORIGIN: z.string().url(),
  DATA_DIR: z.string().default('./data'),

  ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be 32 random bytes encoded as hex'),
  ENCRYPTION_KEY_ID: keyName.default('main'),
  ENCRYPTION_KEYS_JSON: z.string().max(8192).default('{}'),

  REGISTRY_ALLOWED_ORIGINS: z.string().default(''),
  REGISTRY_TOKEN_ORIGINS: z.string().default(''),
  REGISTRY_BLOB_ORIGINS: z.string().default(''),

  ALLOW_HTTP_REGISTRIES: flag,
  TRUST_PROXY: flag,
  TRUSTED_PROXIES: proxyList,

  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),

  PULL_URL: pullUrlSchema.default(''),
  TAGLIST_ORDER: z.enum(TAG_ORDERS).default('date-desc'),
  HISTORY_CUSTOM_LABELS: customLabels,

  LDAP_ENABLED: flag,
  LDAP_URL: z.string().max(2048).default(''),
  LDAP_STARTTLS: flag,
  LDAP_BASE_DN: z.string().max(2048).default(''),
  LDAP_BIND_DN: z.string().max(2048).default(''),
  LDAP_BIND_PASSWORD_ENCRYPTED: z.string().max(16_384).default(''),
  LDAP_USER_FILTER: z.string().max(2048).default('(uid={username})'),
  LDAP_SESSION_MINUTES: z.coerce.number().int().min(5).max(60).default(15),

  TRIVY_ENABLED: flag,
  TRIVY_PATH: z.string().max(2048).default('/usr/local/bin/trivy'),
  TRIVY_RUNNER_URL: pullUrlSchema.default(''),
  TRIVY_RUNNER_TOKEN: z.string().max(128).default(''),
  TRIVY_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(600).default(180),
  TRIVY_SCANS_PER_HOUR: z.coerce.number().int().min(1).max(60).default(16),

  BRAND_NAME: z.string().min(1).max(64).default('Registry Console'),
})

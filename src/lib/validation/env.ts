import { z } from 'zod'

import { pullUrlSchema } from '@/lib/validation/url'
import { TAG_ORDERS } from '@/utils/tag-order'

export const envSchema = z.object({
  APP_ORIGIN: z.string().url(),
  DATA_DIR: z.string().default('./data'),
  ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be 32 random bytes encoded as hex'),
  REGISTRY_ALLOWED_ORIGINS: z.string().default(''),
  REGISTRY_TOKEN_ORIGINS: z.string().default(''),
  REGISTRY_BLOB_ORIGINS: z.string().default(''),
  ALLOW_HTTP_REGISTRIES: z.enum(['true', 'false']).default('false'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  PULL_URL: pullUrlSchema.default(''),
  TAGLIST_ORDER: z.enum(TAG_ORDERS).default('natural-asc'),
  HISTORY_CUSTOM_LABELS: z
    .string()
    .max(4096)
    .default('')
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean)
      ),
    ])
    .pipe(z.array(z.string().min(1).max(256)).max(32)),
  LDAP_ENABLED: z.enum(['true', 'false']).default('false'),
  LDAP_URL: z.string().max(2048).default(''),
  LDAP_STARTTLS: z.enum(['true', 'false']).default('false'),
  LDAP_BASE_DN: z.string().max(2048).default(''),
  LDAP_BIND_DN: z.string().max(2048).default(''),
  LDAP_BIND_PASSWORD_ENCRYPTED: z.string().max(16_384).default(''),
  LDAP_USER_FILTER: z.string().max(2048).default('(uid={username})'),
  LDAP_SESSION_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  TRIVY_SCANS_PER_HOUR: z.coerce.number().int().min(1).max(60).default(16),
  TRIVY_ENABLED: z.enum(['true', 'false']).default('false'),
  TRIVY_PATH: z.string().max(2048).default('/usr/local/bin/trivy'),
  TRIVY_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(600).default(180),
  BRAND_NAME: z.string().min(1).max(64).default('Registry Console'),
})

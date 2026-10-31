export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.NEXT_PHASE === 'phase-production-build'
  ) {
    return
  }

  const { env } = await import('@/lib/config/env')
  const { users } = await import('@/lib/config/users')
  const { securityAccounts } = await import('@/lib/auth/accounts')

  const config = env()

  const { secretKeys } = await import('@/lib/security/keys')
  secretKeys()

  const accounts = users()

  const { ssoProviders } = await import('@/lib/auth/sso')
  const providers = ssoProviders()

  if (accounts.some((user) => user.authProvider === 'sso') && !providers.length) {
    throw new Error('SSO accounts require at least one configured provider.')
  }

  if (accounts.some((user) => user.authProvider === 'ldap')) {
    throw new Error(
      'Remove LDAP users from AUTH_USERS_JSON and configure LDAP role groups instead.'
    )
  }

  if (config.LDAP_ENABLED === 'true') {
    const { directoryConfig } = await import('@/lib/auth/directory')
    directoryConfig()
  }

  securityAccounts(accounts)

  const { seedRegistry } = await import('@/lib/registry/store')
  seedRegistry()

  if (config.TRIVY_ENABLED === 'true') {
    if (process.env.NODE_ENV === 'production' && !config.TRIVY_RUNNER_URL) {
      throw new Error(
        'Set TRIVY_RUNNER_URL to an isolated scanner worker before enabling production scans.'
      )
    }

    const { scanWorker } = await import('@/lib/registry/trivy/worker')
    scanWorker()
  }
}

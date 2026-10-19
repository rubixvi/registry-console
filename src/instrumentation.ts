export async function register(): Promise<void> {
  const isNodeRuntime = process.env.NEXT_RUNTIME === 'nodejs'
  const isProductionBuild = process.env.NEXT_PHASE === 'phase-production-build'

  if (!isNodeRuntime || isProductionBuild) {
    return
  }

  const { env } = await import('@/lib/config/env')
  const { users } = await import('@/lib/config/users')
  const { securityAccounts } = await import('@/lib/auth/accounts')

  env()
  const { secretKeys } = await import('@/lib/security/keys')

  secretKeys()
  const configured = users()
  const { ssoProviders } = await import('@/lib/auth/sso')
  const providers = ssoProviders()

  if (configured.some((user) => user.authProvider === 'sso') && !providers.length) {
    throw new Error('SSO accounts require at least one configured provider.')
  }

  if (configured.some((user) => user.authProvider === 'ldap')) {
    throw new Error(
      'Remove LDAP users from AUTH_USERS_JSON and configure LDAP role groups instead.'
    )
  }

  if (env().LDAP_ENABLED === 'true') {
    const { directoryConfig } = await import('@/lib/auth/directory')

    directoryConfig()
  }

  securityAccounts(configured)

  const { seedRegistry } = await import('@/lib/registry/store')

  seedRegistry()

  if (env().TRIVY_ENABLED === 'true') {
    if (process.env.NODE_ENV === 'production' && !env().TRIVY_RUNNER_URL) {
      throw new Error(
        'Set TRIVY_RUNNER_URL to an isolated scanner worker before enabling production scans.'
      )
    }

    const { startScanWorker } = await import('@/lib/registry/trivy-worker')

    startScanWorker()
  }
}

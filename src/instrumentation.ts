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
  securityAccounts(users())
}

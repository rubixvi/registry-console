import { ssoProviders } from '@/lib/auth/sso'

export function getSso() {
  return ssoProviders().map((provider) => ({
    id: provider.id,
    name: provider.name ?? provider.id,
  }))
}

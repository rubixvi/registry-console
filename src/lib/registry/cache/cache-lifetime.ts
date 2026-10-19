import 'server-only'

import { DIGEST_LIFETIME, MUTABLE_LIFETIME } from '@/lib/registry/cache/constants'

export function cacheLifetime(path: string): number {
  const pathname = path.split('?')[0]

  if (/\/(?:manifests|blobs)\/sha256(?:%3A|:)[a-f0-9]{64}$/i.test(pathname)) {
    return DIGEST_LIFETIME
  }

  if (
    /^\/(?:user|users\/[^/]+|orgs\/[^/]+)(?:\/packages(?:\/container\/[^/]+\/versions)?)?$/.test(
      pathname
    ) ||
    /^\/v2\/namespaces\/[^/]+\/repositories(?:\/[^/]+(?:\/tags(?:\/[^/]+)?)?)?$/.test(pathname) ||
    pathname === '/v2/_catalog' ||
    /\/(?:tags\/list|manifests\/[^/]+)$/.test(pathname)
  ) {
    return MUTABLE_LIFETIME
  }

  return 0
}

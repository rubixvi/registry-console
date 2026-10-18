import 'server-only'

import { tokens } from '@/lib/registry/token-cache/state'

export function forgetToken(key: string, expected?: string | null): void {
  if (expected === undefined || tokens.get(key)?.value === expected) tokens.delete(key)
}

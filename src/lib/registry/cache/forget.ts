import 'server-only'

import { entries, state } from '@/lib/registry/cache/state'

export function forget(id: string): void {
  const entry = entries.get(id)

  if (!entry) return

  state.bytes -= entry.bytes
  entries.delete(id)
}

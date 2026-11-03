import 'server-only'

import { getPasskey } from '@/lib/database/passkey'
import { type PasskeyRow } from '@/types/security'

export function findPasskey(id: string): PasskeyRow | undefined {
  return getPasskey(id)
}

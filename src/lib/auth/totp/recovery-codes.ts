import 'server-only'

import { randomBytes } from 'node:crypto'

export function recoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => randomBytes(10).toString('hex').match(/.{5}/g)!.join('-'))
}

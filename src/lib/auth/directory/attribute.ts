import 'server-only'

import { type Entry } from 'ldapts'

export function directoryAttribute(entry: Entry, name: string): (string | Buffer)[] {
  const found = Object.entries(entry).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  const values = Array.isArray(found) ? found : found === undefined ? [] : [found]

  return values.filter(
    (value): value is string | Buffer => typeof value === 'string' || Buffer.isBuffer(value)
  )
}

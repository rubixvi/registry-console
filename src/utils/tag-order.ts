export const TAG_ORDERS = [
  'date-desc',
  'date-asc',
  'natural-asc',
  'natural-desc',
  'alpha-asc',
  'alpha-desc',
] as const

export type TagOrder = (typeof TAG_ORDERS)[number]

const numeric = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'variant',
})

export function isTagOrder(value: unknown): value is TagOrder {
  return TAG_ORDERS.some((order) => order === value)
}

export function sortTags(
  tags: string[],
  order: TagOrder,
  dates: ReadonlyMap<string, string | null> = new Map()
): string[] {
  const direction = order.endsWith('desc') ? -1 : 1
  const timestamps = new Map<string, number>()

  if (order.startsWith('date-')) {
    for (const tag of tags) {
      const date = dates.get(tag)
      const timestamp = date ? Date.parse(date) : NaN

      if (Number.isFinite(timestamp)) timestamps.set(tag, timestamp)
    }
  }

  return [...tags].sort((a, b) => {
    const lexical = a < b ? -1 : a > b ? 1 : 0

    if (order.startsWith('date-')) {
      const first = timestamps.get(a)
      const second = timestamps.get(b)

      if (first === undefined && second !== undefined) return 1
      if (first !== undefined && second === undefined) return -1
      if (first !== undefined && second !== undefined && first !== second) {
        return (first - second) * direction
      }

      return numeric.compare(a, b) || lexical
    }

    const compared = order.startsWith('natural') ? numeric.compare(a, b) || lexical : lexical

    return compared * direction
  })
}

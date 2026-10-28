export const TAG_ORDERS = [
  'date-desc',
  'date-asc',
  'natural-asc',
  'natural-desc',
  'alpha-asc',
  'alpha-desc',
] as const

export type TagOrder = (typeof TAG_ORDERS)[number]

const collator = new Intl.Collator('en', {
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
  const dateOrder = order.startsWith('date-')
  const timestamps = new Map<string, number>()

  if (dateOrder) {
    for (const tag of tags) {
      const date = dates.get(tag)
      if (!date) continue

      const time = Date.parse(date)
      if (Number.isFinite(time)) timestamps.set(tag, time)
    }
  }

  return [...tags].sort((first, second) => {
    const lexical = first < second ? -1 : first > second ? 1 : 0

    if (dateOrder) {
      const firstDate = timestamps.get(first)
      const secondDate = timestamps.get(second)

      if (firstDate === undefined && secondDate !== undefined) return 1
      if (secondDate === undefined && firstDate !== undefined) return -1

      if (firstDate !== undefined && secondDate !== undefined && firstDate !== secondDate) {
        return (firstDate - secondDate) * direction
      }

      return collator.compare(first, second) || lexical
    }

    const result = order.startsWith('natural-')
      ? collator.compare(first, second) || lexical
      : lexical

    return result * direction
  })
}

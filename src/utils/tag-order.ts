export const TAG_ORDERS = ['natural-asc', 'natural-desc', 'alpha-asc', 'alpha-desc'] as const

export type TagOrder = (typeof TAG_ORDERS)[number]

const numeric = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'variant',
})

export function isTagOrder(value: unknown): value is TagOrder {
  return TAG_ORDERS.some((order) => order === value)
}

export function sortTags(tags: string[], order: TagOrder): string[] {
  const direction = order.endsWith('desc') ? -1 : 1

  return [...tags].sort((a, b) => {
    const lexical = a < b ? -1 : a > b ? 1 : 0
    const compared = order.startsWith('natural') ? numeric.compare(a, b) || lexical : lexical

    return compared * direction
  })
}

export function selectTags(
  visible: string[],
  selected: string[],
  tag: string,
  anchor: string | null = null
): string[] {
  const end = visible.indexOf(tag)

  if (end === -1) return selected.filter((value) => visible.includes(value))

  const start = anchor === null ? -1 : visible.indexOf(anchor)
  const range = start === -1 ? [tag] : visible.slice(Math.min(start, end), Math.max(start, end) + 1)
  const removing = selected.includes(tag)
  const values = new Set(selected.filter((value) => visible.includes(value)))

  for (const value of range) {
    if (removing) values.delete(value)
    else values.add(value)
  }

  return visible.filter((value) => values.has(value))
}

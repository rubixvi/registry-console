export function selectTags(
  visible: string[],
  selected: string[],
  tag: string,
  anchor: string | null = null
): string[] {
  const index = visible.indexOf(tag)

  if (index === -1) {
    return selected.filter((value) => visible.includes(value))
  }

  let start = visible.indexOf(anchor ?? tag)
  if (start === -1) start = index

  const range = visible.slice(Math.min(start, index), Math.max(start, index) + 1)
  const tags = new Set(selected)
  const remove = tags.has(tag)

  for (const value of range) {
    if (remove) {
      tags.delete(value)
    } else {
      tags.add(value)
    }
  }

  return visible.filter((value) => tags.has(value))
}

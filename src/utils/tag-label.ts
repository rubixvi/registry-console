export function tagLabel(tag: string): string {
  const match = /^sha-([a-f0-9]{7,})$/i.exec(tag)
  return match ? `sha-${match[1].slice(0, 6)}` : tag
}

export function tagLabel(tag: string): string {
  return tag.replace(/^sha-([a-f0-9]{6})[a-f0-9]+$/i, 'sha-$1')
}

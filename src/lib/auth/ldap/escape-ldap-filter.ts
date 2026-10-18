import 'server-only'

export function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (character) => {
    return `\\${character.charCodeAt(0).toString(16).padStart(2, '0')}`
  })
}

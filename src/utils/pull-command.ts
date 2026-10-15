export function pullCommand(
  url: string,
  repository: string,
  reference: string,
  pullUrl = ''
): string {
  const host = new URL(pullUrl || url).host
  const separator = reference.startsWith('sha256:') ? '@' : ':'

  return `docker pull ${host}/${repository}${separator}${reference}`
}

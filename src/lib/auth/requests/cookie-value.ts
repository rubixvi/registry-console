import 'server-only'

export function cookieValue(request: Request, name: string): string {
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .find((part) => part.trim().startsWith(`${name}=`))

  return cookie?.trim().slice(name.length + 1) ?? ''
}

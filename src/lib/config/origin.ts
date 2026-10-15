export function appOrigin(value: string, production: boolean): string {
  const url = new URL(value)
  const { protocol, hostname } = url

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('APP_ORIGIN must use HTTP or HTTPS.')
  }

  const isLoopback =
    hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)

  const requiresHttps = production && !isLoopback

  if (requiresHttps && protocol !== 'https:') {
    throw new Error(
      'APP_ORIGIN must use HTTPS in production, except on localhost or a loopback IP.'
    )
  }

  return url.origin
}

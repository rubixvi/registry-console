import assert from 'node:assert/strict'

type Props = {
  base: string
  origin: string
  method?: string
  cookie?: string
  jar?: Map<string, string>
}

type Options = {
  method?: string
  body?: unknown
  cookie?: string
  origin?: string
  fresh?: boolean
}

export function createCheck() {
  function check(value: unknown, message: string): void {
    assert.ok(value, message)
    check.count++
  }

  check.count = 0

  return check
}

export function createRequest({ base, origin, method = 'GET', cookie, jar }: Props) {
  return async function request(url: string, options: Options = {}): Promise<Response> {
    const headers = new Headers({
      Origin: options.origin ?? origin,
      'Content-Type': 'application/json',
    })
    const session =
      options.cookie ??
      (jar ? [...jar].map(([name, value]) => `${name}=${value}`).join('; ') : cookie)

    if (session !== undefined) {
      headers.set('Cookie', session)
    }

    if (options.fresh) {
      headers.set('Cache-Control', 'no-cache')
    }

    const response = await fetch(`${base}${url}`, {
      method: options.method ?? method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    })

    if (jar) {
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0]
        const index = pair.indexOf('=')

        jar.set(pair.slice(0, index), pair.slice(index + 1))
      }
    }

    return response
  }
}

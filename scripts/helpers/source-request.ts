import { request } from 'node:http'

export async function sourceRequest(base: string, origin: string, source: string, body: string) {
  return new Promise<{ status: number; retry: string | undefined }>((resolve, reject) => {
    const outgoing = request(
      new URL('/api/auth/login', base),
      {
        method: 'POST',
        localAddress: source,
        headers: { Origin: origin, 'Content-Type': 'application/json' },
      },
      (response) => {
        response.once('error', reject)
        response.once('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            retry: response.headers['retry-after'],
          })
        )
        response.resume()
      }
    )

    outgoing.setTimeout(30_000, () => outgoing.destroy(new Error('Login request timed out.')))
    outgoing.once('error', reject)
    outgoing.end(body)
  })
}

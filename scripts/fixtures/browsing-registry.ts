import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

export async function mockBrowsingRegistry() {
  const config = JSON.stringify({
    os: 'linux',
    architecture: 'amd64',
    config: {
      Labels: {
        'org.opencontainers.image.version': '2.0.0',
        'com.example.team': '<script>example</script>',
        'com.example.hidden': 'Not selected',
      },
    },
    history: [{ created_by: 'RUN build', empty_layer: true }],
  })
  const configDigest = `sha256:${createHash('sha256').update(config).digest('hex')}`
  const manifest = JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: { digest: configDigest, size: Buffer.byteLength(config) },
    layers: [],
  })
  const digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`
  const state = {
    repositories: [
      'team',
      'team/app',
      'team/backend/api',
      'team/backend/worker',
      'standalone',
      ...Array.from(
        { length: 205 },
        (_, index) => `services/app${String(index + 1).padStart(3, '0')}`
      ),
    ],
    tags: ['latest', ...Array.from({ length: 205 }, (_, index) => `v${index + 1}`)],
    loop: false,
    fail: false,
    control: '',
    pause: false,
    release: undefined as (() => void) | undefined,
  }
  const requests = new Map<string, number>()
  let origin = ''

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', origin)
    const pathname = decodeURIComponent(url.pathname)

    requests.set(url.pathname, (requests.get(url.pathname) ?? 0) + 1)
    response.setHeader('Content-Type', 'application/json')

    if (state.control) response.setHeader('Cache-Control', state.control)

    if (state.fail) {
      response.statusCode = 503
      response.end('{}')

      return
    }

    if (pathname === '/v2/') {
      response.end('{}')

      return
    }

    if (pathname === '/v2/_catalog' || pathname === '/v2/team/app/tags/list') {
      const source = pathname.endsWith('_catalog') ? state.repositories : state.tags
      const last = url.searchParams.get('last') ?? ''
      const remaining = [...source].sort().filter((item) => item > last)
      const items = remaining.slice(0, Number(url.searchParams.get('n') ?? 100))
      const next = state.loop
        ? 'repeat'
        : remaining.length > items.length
          ? items.at(-1)
          : undefined

      if (next)
        response.setHeader('Link', `<${url.pathname}?last=${encodeURIComponent(next)}>; rel="next"`)

      response.end(
        JSON.stringify(pathname.endsWith('_catalog') ? { repositories: items } : { tags: items })
      )

      return
    }

    if (pathname === `/v2/team/app/blobs/${configDigest}`) {
      response.end(config)

      return
    }

    if (pathname.startsWith('/v2/team/app/manifests/')) {
      if (request.method === 'DELETE') {
        state.tags = []
        response.statusCode = 202
        response.end()

        return
      }

      if (!state.tags.length) {
        response.statusCode = 404
        response.end('{}')

        return
      }

      response.setHeader('Docker-Content-Digest', digest)

      if (state.pause) {
        state.release = () => response.end(manifest)
      } else {
        response.end(manifest)
      }

      return
    }

    response.statusCode = 404
    response.end('{}')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()

  if (!address || typeof address === 'string') throw new Error('Fixture port unavailable.')

  origin = `http://127.0.0.1:${address.port}`

  return {
    origin,
    state,
    requests,
    digest,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  }
}

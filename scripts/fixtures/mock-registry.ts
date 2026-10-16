import { createServer } from 'node:http'

import { contentDigest } from '../helpers/crypto.mjs'
import { close, listen } from '../helpers/network.mjs'

type TokenRequest = {
  scope: string
  authorization: string
}

type FixtureState = {
  deleted: boolean
  mode: 'normal' | 'evil-token'
  tokens: TokenRequest[]
}

export async function mockRegistry() {
  const config = JSON.stringify({
    created: '2026-10-01T09:00:00Z',
    os: 'linux',
    architecture: 'amd64',
    history: [{ created_by: 'RUN echo hello' }],
  })

  const configDigest = contentDigest(config)

  const manifest = JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      size: Buffer.byteLength(config),
      digest: configDigest,
    },
    layers: [
      {
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        size: 5 * 1024 * 1024,
        digest: `sha256:${'a'.repeat(64)}`,
      },
    ],
  })

  const digest = contentDigest(manifest)

  const index = JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: [
      {
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        digest,
        size: Buffer.byteLength(manifest),
        platform: {
          os: 'linux',
          architecture: 'amd64',
        },
      },
    ],
  })

  const indexDigest = contentDigest(index)
  const basicAuthorization = `Basic ${Buffer.from('robot:registry-secret').toString('base64')}`

  const state: FixtureState = {
    deleted: false,
    mode: 'normal',
    tokens: [],
  }

  let origin = ''

  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', origin)
    const authorization = request.headers.authorization || ''

    response.setHeader('Content-Type', 'application/json')

    if (url.pathname === '/token') {
      state.tokens.push({
        scope: url.searchParams.get('scope') || '',
        authorization,
      })

      if (authorization !== basicAuthorization) {
        response.statusCode = 401
        response.end('{}')
        return
      }

      response.end(JSON.stringify({ token: 'fixture-token' }))
      return
    }

    const hasBearerToken = authorization === 'Bearer fixture-token'
    const hasUnsafeRealm = state.mode === 'evil-token'

    if (!hasBearerToken || hasUnsafeRealm) {
      const realm = hasUnsafeRealm ? 'https://evil.example/token' : `${origin}/token`

      response.statusCode = 401
      response.setHeader(
        'WWW-Authenticate',
        `Bearer service="fixture", scope="repository:evil:push", realm="${realm}"`
      )
      response.end('{}')
      return
    }

    if (url.pathname === '/v2/') {
      response.end('{}')
      return
    }

    if (url.pathname === '/v2/_catalog') {
      const hasCursor = url.searchParams.has('last')

      if (!hasCursor) {
        response.setHeader('Link', '</v2/_catalog?n=100&last=team%2Fapi>; rel="next"')
      }

      response.end(
        JSON.stringify({
          repositories: hasCursor ? ['worker'] : ['team/api'],
        })
      )
      return
    }

    if (url.pathname === '/v2/team/api/tags/list') {
      const tags = state.deleted ? ['multi'] : ['latest', 'stable', 'multi']

      response.end(JSON.stringify({ name: 'team/api', tags }))
      return
    }

    const pathname = decodeURIComponent(url.pathname)

    if (pathname === `/v2/team/api/blobs/${configDigest}`) {
      response.end(config)
      return
    }

    if (pathname.startsWith('/v2/redirect/')) {
      response.statusCode = 302
      response.setHeader('Location', 'https://evil.example')
      response.end('{}')
      return
    }

    if (pathname.startsWith('/v2/bad/')) {
      response.setHeader('Docker-Content-Digest', `sha256:${'0'.repeat(64)}`)
      response.end(manifest)
      return
    }

    const manifestPrefix = '/v2/team/api/manifests/'

    if (pathname.startsWith(manifestPrefix)) {
      const reference = pathname.slice(manifestPrefix.length)

      if (request.method === 'DELETE') {
        if (reference === digest && !state.deleted) {
          state.deleted = true
          response.statusCode = 202
          response.end()
          return
        }

        response.statusCode = 404
        response.end('{}')
        return
      }

      if (reference === 'multi' || reference === indexDigest) {
        response.setHeader('Docker-Content-Digest', indexDigest)
        response.end(index)
        return
      }

      const hasManifest = ['latest', 'stable', digest].includes(reference)

      if (!state.deleted && hasManifest) {
        response.setHeader('Docker-Content-Digest', digest)
        response.end(manifest)
        return
      }
    }

    response.statusCode = 404
    response.end('{}')
  })

  const port = await listen(server)

  origin = `http://127.0.0.1:${port}`

  return {
    origin,
    digest,
    state,
    close: () => close(server),
  }
}

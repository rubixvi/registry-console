import { createServer } from 'node:http'

import { contentDigest } from '../helpers/crypto.mjs'
import { close, listen } from '../helpers/network.mjs'

export async function mockConsole() {
  const config = JSON.stringify({
    created: '2026-10-01T09:00:00Z',
    os: 'linux',
    architecture: 'amd64',
    history: [
      {
        created: '2026-09-30T00:00:00Z',
        created_by: 'ADD base',
        author: 'Builder',
      },
      {
        created: '2026-10-01T08:00:00Z',
        created_by: 'ENV APP=console',
        empty_layer: true,
      },
      {
        created: '2026-10-01T09:00:00Z',
        created_by: 'RUN build',
        comment: 'Release image',
      },
    ],
  })

  const configDigest = contentDigest(config)

  const manifests = new Map<string, string>()

  const tags = new Map<string, string>()

  const deletes = new Map<string, number>()

  const deleted = new Set<string>()

  for (const name of ['app', 'worker', 'protected']) {
    const manifest = JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: {
        digest: configDigest,
        size: Buffer.byteLength(config),
      },
      layers: [
        {
          digest: `sha256:${'a'.repeat(64)}`,
          size: 1024,
        },
        {
          digest: `sha256:${'b'.repeat(64)}`,
          size: 2048,
        },
      ],
      annotations: { name },
    })

    const digest = contentDigest(manifest)

    manifests.set(digest, manifest)
    tags.set(name, digest)
  }

  tags.set('latest', tags.get('app')!)
  tags.set('stable', tags.get('app')!)

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://registry.test')

    const pathname = decodeURIComponent(url.pathname)

    response.setHeader('Content-Type', 'application/json')

    if (pathname === '/v2/' || pathname === '/v2/_catalog') {
      response.end(JSON.stringify({ repositories: ['team/app'] }))

      return
    }

    if (pathname === '/v2/team/app/tags/list') {
      response.end(
        JSON.stringify({
          name: 'team/app',
          tags: [...tags].filter(([, digest]) => !deleted.has(digest)).map(([tag]) => tag),
        })
      )

      return
    }

    if (pathname === `/v2/team/app/blobs/${configDigest}`) {
      response.end(config)

      return
    }

    if (pathname.startsWith('/v2/team/app/manifests/')) {
      const reference = pathname.slice('/v2/team/app/manifests/'.length)

      const digest = tags.get(reference) ?? reference

      const manifest = manifests.get(digest)

      if (request.method === 'DELETE') {
        deletes.set(digest, (deletes.get(digest) ?? 0) + 1)

        if (digest === tags.get('protected')) {
          response.statusCode = 405
        } else if (manifest && !deleted.has(digest)) {
          deleted.add(digest)

          response.statusCode = 202
        } else {
          response.statusCode = 404
        }

        response.end('{}')

        return
      }

      if (manifest && !deleted.has(digest)) {
        response.setHeader('Docker-Content-Digest', digest)
        response.end(manifest)

        return
      }
    }

    response.statusCode = 404
    response.end('{}')
  })

  const port = await listen(server)

  return {
    origin: `http://127.0.0.1:${port}`,
    tags,
    deletes,
    deleted,
    close: () => close(server),
  }
}

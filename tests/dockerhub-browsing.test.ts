import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { beforeEach, test } from 'node:test'

import { cacheGeneration, invalidateRegistry, rememberResponse } from '../src/lib/registry/cache'
import { registryPage } from '../src/lib/registry/catalog'
import { registryRequest } from '../src/lib/registry/client'
import { imageDetails, imageManifest } from '../src/lib/registry/image'
import { imageMetadata } from '../src/lib/registry/metadata'
import { encryptSecret } from '../src/lib/security/crypto'
import { AppError } from '../src/lib/security/error'
import { type RegistryRecord } from '../src/types/registry'

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  ENCRYPTION_KEY: 'e'.repeat(64),
  REGISTRY_ALLOWED_ORIGINS: '',
  REGISTRY_TOKEN_ORIGINS: '',
  REGISTRY_BLOB_ORIGINS: '',
})

const digest = `sha256:${'a'.repeat(64)}`
const repository = 'team/app'
const tagPath = '/v2/namespaces/team/repositories/app/tags'
const manifestPath = '/v2/team/app/manifests/latest'
const scope = 'repository:team/app:pull'

function connection(id: string): RegistryRecord {
  return {
    id,
    name: id,
    provider: 'dockerhub',
    namespace: 'team',
    url: 'https://registry-1.docker.io',
    pullUrl: '',
    username: '',
    password: '',
    readOnly: true,
  }
}

function tag(name = 'latest') {
  return {
    name,
    digest,
    tag_last_pushed: '2026-10-18T00:00:00Z',
    content_type: 'image',
    images: [{ os: 'linux', architecture: 'amd64' }],
  }
}

beforeEach(() => {
  const globals = globalThis as typeof globalThis & {
    registryConsoleBackoffs?: Map<string, number>
  }

  globals.registryConsoleBackoffs?.clear()
})

test('Docker Hub tag pages supply previews without downloading registry manifests', async (context) => {
  const registry = connection('tag-pages')
  let requests = 0

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))

    requests++
    assert.equal(url.origin, 'https://hub.docker.com')

    if (url.pathname === tagPath.replace('/tags', '')) {
      return Response.json({ name: 'app', namespace: 'team', is_private: false })
    }

    assert.equal(url.pathname, tagPath)
    assert.equal(url.searchParams.get('page_size'), '1')

    return Response.json({
      results: [tag(url.searchParams.get('page') === '2' ? 'Release-2' : 'latest')],
      next: url.searchParams.get('page') === '2' ? null : `${tagPath}?page=2&page_size=1`,
    })
  })

  const first = await registryPage(registry, { repository, last: '', n: 1 })
  const second = await registryPage(registry, { repository, last: first.next!, n: 1 })

  assert.deepEqual(first, { items: ['latest'], next: '2' })
  assert.deepEqual(second, { items: ['Release-2'], next: null })
  assert.deepEqual(await imageMetadata(registry, repository, 'latest'), {
    isPrivate: false,
    digest,
    created: null,
    pushedAt: '2026-10-18T00:00:00.000Z',
    runnable: true,
  })
  assert.equal((await imageMetadata(registry, repository, 'Release-2')).digest, digest)
  assert.equal(requests, 3)
})

test('tag metadata without a top-level digest uses HEAD and excludes unknown platforms', async (context) => {
  const registry = connection('tag-head')
  const methods: string[] = []

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))

      methods.push(`${url.origin} ${init?.method ?? 'GET'}`)

      if (url.origin === 'https://hub.docker.com') {
        return Response.json({
          name: 'proof',
          images: [{ os: 'unknown', architecture: 'unknown' }],
        })
      }

      assert.equal(init?.method, 'HEAD')

      return new Response(null, { headers: { 'Docker-Content-Digest': digest } })
    }
  )

  const metadata = await imageMetadata(registry, repository, 'proof')

  assert.equal(metadata.digest, digest)
  assert.equal(metadata.runnable, false)
  assert.deepEqual(methods, [
    'https://hub.docker.com GET',
    'https://hub.docker.com GET',
    'https://registry-1.docker.io HEAD',
  ])
})

test('Hub metadata validates names, namespace boundaries, artifacts and pagination', async (context) => {
  const registry = connection('tag-validation')
  let body: unknown = { ...tag(), name: 'other' }
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return Response.json(body)
  })

  await assert.rejects(imageMetadata(registry, 'other/private', 'latest'), /namespace/)
  assert.equal(requests, 0)
  await assert.rejects(imageMetadata(registry, repository, 'latest'), /invalid tag metadata/)

  body = { ...tag(), content_type: 'artifact' }
  assert.equal((await imageMetadata(registry, repository, 'latest', true)).runnable, false)

  body = { results: [tag()], next: 'https://attacker.example/tags?page=2' }
  await assert.rejects(registryPage(registry, { repository, last: '', n: 1 }), /pagination/)
  body = { results: [tag(), tag('other')], next: null }
  await assert.rejects(registryPage(registry, { repository, last: '', n: 1 }, true), /page limit/)
})

test('Hub preview caches respect no-store, expiry, refresh and connection identities', async (context) => {
  const registry = connection('tag-cache')
  let now = Date.now()
  let requests = 0
  let control = 'no-store'

  context.mock.method(Date, 'now', () => now)
  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    requests++

    if (new URL(String(raw)).pathname === tagPath.replace('/tags', '')) {
      return Response.json({ name: 'app', namespace: 'team', is_private: false })
    }

    return Response.json(
      { results: [tag()], next: null },
      { headers: { 'Cache-Control': control } }
    )
  })

  const input = { repository, last: '', n: 1 }

  await registryPage(registry, input)
  await registryPage(registry, input)
  assert.equal(requests, 2)

  control = 'max-age=1'
  await registryPage(registry, input)
  now += 900
  await registryPage(registry, input)
  assert.equal((await imageMetadata(registry, repository, 'latest')).digest, digest)
  assert.equal(requests, 4)

  now += 101
  await registryPage(registry, input)
  await imageMetadata(registry, repository, 'latest')
  assert.equal(requests, 5)
  await registryPage(registry, input, true)
  await registryPage({ ...registry, id: 'another-connection' }, input)
  assert.equal(requests, 7)
})

test('concurrent identical requests share a fetch and retain independent response headers', async (context) => {
  const registry = connection('shared-requests')
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return new Response('manifest', { headers: { 'Docker-Content-Digest': digest } })
  })

  const responses = await Promise.all(
    Array.from({ length: 20 }, () => registryRequest(registry, manifestPath, { scope }))
  )

  assert.equal(requests, 1)
  responses[0].headers.set('Docker-Content-Digest', 'changed')
  assert.equal(responses[1].headers.get('Docker-Content-Digest'), digest)

  await Promise.all([
    registryRequest({ ...registry, id: 'other-id' }, manifestPath, { scope }),
    registryRequest({ ...registry, revision: 'new-credentials' }, manifestPath, { scope }),
    registryRequest(registry, manifestPath, { scope, method: 'HEAD' }),
  ])
  assert.equal(requests, 4)
})

test('failed shared requests can retry and invalidation separates older in-flight reads', async (context) => {
  const registry = connection('shared-failure')
  let requests = 0
  let release: (() => void) | undefined
  let started: (() => void) | undefined
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })

  context.mock.method(globalThis, 'fetch', async () => {
    const current = ++requests

    if (current === 1) return new Response(null, { status: 503 })
    if (current === 2) {
      started!()
      await waiting
    }

    return new Response(current === 2 ? 'old' : 'new')
  })

  const failed = await Promise.allSettled([
    registryRequest(registry, manifestPath),
    registryRequest(registry, manifestPath),
  ])

  assert.ok(failed.every((result) => result.status === 'rejected'))
  assert.equal(requests, 1)

  const previous = registryRequest(registry, manifestPath)

  await ready
  invalidateRegistry(registry.id)
  assert.equal((await registryRequest(registry, manifestPath)).text, 'new')
  release!()
  await previous
  assert.equal((await registryRequest(registry, manifestPath)).text, 'new')
  assert.equal(requests, 3)
})

test('concurrent authentication reuses tokens even when an earlier 401 arrives late', async (context) => {
  const registry = connection('shared-token')
  let tokens = 0
  let release: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))

      if (url.origin === 'https://auth.docker.io') {
        tokens++
        return Response.json({ token: 'shared-token', expires_in: 300 })
      }

      if (!new Headers(init?.headers).get('Authorization')) {
        if (url.pathname.endsWith('/other')) await waiting

        return new Response(null, {
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Bearer realm="https://auth.docker.io/token",service="registry.docker.io"',
          },
        })
      }

      return new Response('manifest')
    }
  )

  const first = registryRequest(registry, manifestPath, { scope })
  const second = registryRequest(registry, '/v2/team/app/manifests/other', { scope })

  await first
  release!()
  await second
  assert.equal(tokens, 1)
})

test('pull quota pauses only manifest GETs for the affected Docker account', async (context) => {
  const registry = { ...connection('quota'), username: 'reader' }
  let requests = 0

  rememberResponse(
    registry,
    '/v2/team/app/manifests/cached',
    scope,
    {
      text: 'cached manifest',
      headers: new Headers(),
    },
    cacheGeneration()
  )

  context.mock.method(globalThis, 'fetch', async () => {
    requests++

    return requests === 1
      ? new Response('private diagnostics', {
          status: 429,
          headers: { 'RateLimit-Remaining': '0;w=3600', 'RateLimit-Limit': '200;w=3600' },
        })
      : new Response('available')
  })

  await assert.rejects(
    registryRequest(registry, manifestPath, { scope }),
    (error: unknown) =>
      error instanceof AppError &&
      error.status === 429 &&
      error.retryAfter === 3600 &&
      error.message.includes('pull quota') &&
      !error.message.includes('private')
  )
  await assert.rejects(
    registryRequest({ ...registry, id: 'same-account' }, manifestPath),
    /pull quota/
  )
  assert.equal(requests, 1)
  assert.equal(
    (await registryRequest(registry, '/v2/team/app/manifests/cached', { scope })).text,
    'cached manifest'
  )
  await registryRequest(registry, manifestPath, { method: 'HEAD' })
  await registryRequest(registry, '/v2/team/app/tags/list')
  await registryRequest({ ...registry, username: 'another-reader' }, manifestPath)
  assert.equal(requests, 4)
})

test('pull quota error bodies preserve Retry-After without blocking Hub tag browsing', async (context) => {
  const registry = connection('quota-body')
  let requests = 0

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    requests++

    return new URL(String(raw)).origin === 'https://hub.docker.com'
      ? Response.json({ results: [tag()], next: null })
      : new Response('You have reached your unauthenticated pull rate limit.', {
          status: 429,
          headers: { 'Retry-After': '120' },
        })
  })

  await assert.rejects(
    registryRequest(registry, manifestPath),
    (error: unknown) => error instanceof AppError && error.retryAfter === 120
  )
  assert.deepEqual(await registryPage(registry, { repository, last: '', n: 1 }), {
    items: ['latest'],
    next: null,
  })
  await imageMetadata(registry, repository, 'latest')
  await assert.rejects(
    registryRequest({ ...registry, id: 'same-anonymous-ip' }, manifestPath),
    /pull quota/
  )
  assert.equal(requests, 3)
})

test('Docker Hub abuse throttles still pause all registry requests until expiry', async (context) => {
  const registry = connection('abuse-limit')
  let now = Date.now()
  let requests = 0

  context.mock.method(Date, 'now', () => now)
  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return requests === 1
      ? new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '30' } })
      : new Response('available')
  })

  await assert.rejects(registryRequest(registry, manifestPath), /rate limit/)
  await assert.rejects(
    registryRequest({ ...registry, username: 'other' }, manifestPath, { method: 'HEAD' }),
    /rate limit/
  )
  assert.equal(requests, 1)
  now += 30_001
  assert.equal((await registryRequest(registry, manifestPath)).text, 'available')
})

test('Docker authentication and CDN limits do not pause unrelated registry resources', async (context) => {
  const registry = connection('service-limits')
  let tokenRequests = 0
  let cdnRequests = 0

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))

      if (url.origin === 'https://auth.docker.io') {
        tokenRequests++
        return new Response(null, { status: 429, headers: { 'Retry-After': '90' } })
      }

      if (url.origin === 'https://production.cloudflare.docker.com') {
        cdnRequests++
        assert.equal(new Headers(init?.headers).has('Authorization'), false)
        return new Response(null, { status: 429, headers: { 'Retry-After': '45' } })
      }

      if (url.pathname.endsWith('/private')) {
        return new Response(null, {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer realm="https://auth.docker.io/token"' },
        })
      }

      if (url.pathname.includes('/blobs/')) {
        return new Response(null, {
          status: 307,
          headers: { Location: 'https://production.cloudflare.docker.com/blob' },
        })
      }

      return new Response('available')
    }
  )

  await assert.rejects(registryRequest(registry, '/v2/team/app/manifests/private'), /rate limit/)
  await assert.rejects(registryRequest(registry, '/v2/team/app/manifests/private'), /rate limit/)
  assert.equal(tokenRequests, 1)
  assert.equal((await registryRequest(registry, manifestPath)).text, 'available')
  await assert.rejects(registryRequest(registry, `/v2/team/app/blobs/${digest}`), /rate limit/)
  await assert.rejects(registryRequest(registry, `/v2/team/app/blobs/${digest}`), /rate limit/)
  assert.equal(cdnRequests, 1)
  assert.equal((await registryRequest(registry, '/v2/')).text, 'available')
})

test('verified tag manifests and immutable configuration are reused during image inspection', async (context) => {
  const registry = connection('digest-cache')
  const config = JSON.stringify({ os: 'linux', architecture: 'amd64' })
  const configDigest = `sha256:${createHash('sha256').update(config).digest('hex')}`
  const manifest = JSON.stringify({
    schemaVersion: 2,
    config: { digest: configDigest, size: config.length },
    layers: [],
  })
  const manifestDigest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`
  let requests = 0

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    requests++

    return String(raw).includes('/blobs/')
      ? new Response(config)
      : new Response(manifest, { headers: { 'Docker-Content-Digest': manifestDigest } })
  })

  await imageDetails(registry, repository, 'latest')
  await imageDetails(registry, repository, manifestDigest)
  assert.equal(requests, 2)
  await imageManifest(registry, repository, 'latest', true)
  assert.equal(requests, 3)
})

test('immutable manifest aliases respect upstream cache restrictions', async (context) => {
  const registry = connection('alias-expiry')
  const manifest = JSON.stringify({ schemaVersion: 2, layers: [] })
  const digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`
  let now = Date.now()
  let requests = 0
  let control = 'no-store'

  context.mock.method(Date, 'now', () => now)
  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return new Response(manifest, {
      headers: { 'Docker-Content-Digest': digest, 'Cache-Control': control },
    })
  })

  await imageManifest(registry, repository, 'latest')
  await imageManifest(registry, repository, digest)
  assert.equal(requests, 2)

  control = 'max-age=1'
  await imageManifest(registry, repository, 'latest')
  await imageManifest(registry, repository, digest)
  assert.equal(requests, 3)
  now += 1001
  await imageManifest(registry, repository, digest)
  assert.equal(requests, 4)
})

test('Hub token refresh is shared and rate limits do not discard valid authentication', async (context) => {
  const registry = {
    ...connection('hub-token'),
    username: 'reader',
    password: encryptSecret('secret'),
  }
  let now = Date.now()
  let tokens = 0
  let limited = false

  context.mock.method(Date, 'now', () => now)
  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))

      assert.equal(url.origin, 'https://hub.docker.com')

      if (url.pathname === '/v2/auth/token') {
        tokens++
        return Response.json({ access_token: `token-${tokens}` })
      }

      if (limited) return new Response(null, { status: 429, headers: { 'Retry-After': '1' } })
      if (new Headers(init?.headers).get('Authorization') === 'Bearer token-1') {
        return new Response(null, { status: 401 })
      }

      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token-2')
      return Response.json(tag(url.pathname.split('/').at(-1)))
    }
  )

  await Promise.all([
    imageMetadata(registry, repository, 'latest'),
    imageMetadata(registry, repository, 'other'),
  ])
  assert.equal(tokens, 2)
  limited = true
  await assert.rejects(imageMetadata(registry, repository, 'blocked'), /rate limit/)
  limited = false
  now += 1001
  await imageMetadata(registry, repository, 'blocked')
  assert.equal(tokens, 2)
})

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { env } from '../src/lib/config/env'
import { registryRequest } from '../src/lib/registry/client'
import { dockerHubPage } from '../src/lib/registry/dockerhub'
import { imageDigest } from '../src/lib/registry/image-digest'
import { checkBackoff, limitRegistry } from '../src/lib/registry/throttle'
import { apiError } from '../src/lib/security/api'
import { AppError } from '../src/lib/security/error'
import { type RegistryRecord } from '../src/types/registry'

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  ENCRYPTION_KEY: 'e'.repeat(64),
  REGISTRY_ALLOWED_ORIGINS: '',
  REGISTRY_BLOB_ORIGINS: '',
})

const digest = `sha256:${'a'.repeat(64)}`

function connection(name: string): RegistryRecord {
  const url = `https://${name}.example`

  env().REGISTRY_ALLOWED_ORIGINS += `,${url}`

  return { id: name, name, url, pullUrl: '', username: '', password: '', readOnly: true }
}

test('registry 429 responses preserve Retry-After and pause other connections using the same origin', async (context) => {
  const registry = connection('rate-limit')
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return new Response('private upstream diagnostics', {
      status: 429,
      headers: { 'Retry-After': '120' },
    })
  })

  let failure: AppError | undefined

  await assert.rejects(registryRequest(registry, '/v2/'), (error: unknown) => {
    assert.ok(error instanceof AppError)
    assert.equal(error.status, 429)
    assert.equal(error.retryAfter, 120)
    assert.equal(error.message.includes('private'), false)
    failure = error
    return true
  })

  await assert.rejects(
    registryRequest({ ...registry, id: 'another-connection' }, '/v2/'),
    (error: unknown) => error instanceof AppError && error.status === 429
  )
  assert.equal(requests, 1)

  const response = apiError(failure)

  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '120')
})

test('cooldowns accept HTTP dates, recover on expiry and cannot be shortened by another response', (context) => {
  const origin = 'https://cooldown.example'
  let now = Date.parse('2026-10-17T00:00:00Z')

  context.mock.method(Date, 'now', () => now)

  assert.equal(
    limitRegistry(origin, new Headers({ 'Retry-After': 'Sat, 17 Oct 2026 00:02:00 GMT' }))
      .retryAfter,
    120
  )
  assert.equal(limitRegistry(origin, new Headers({ 'Retry-After': '1' })).retryAfter, 120)
  assert.throws(
    () => checkBackoff(origin),
    (error: unknown) => error instanceof AppError && error.status === 429
  )

  now += 120_001

  assert.doesNotThrow(() => checkBackoff(origin))
  assert.equal(
    limitRegistry('https://invalid-delay.example', new Headers({ 'Retry-After': 'invalid' }))
      .retryAfter,
    60
  )
  assert.equal(
    limitRegistry('https://bounded-delay.example', new Headers({ 'Retry-After': '999999999999' }))
      .retryAfter,
    86400
  )
})

test('Docker Hub exhausted quota headers provide a conservative cooldown when Retry-After is absent', () => {
  const error = limitRegistry(
    'https://registry-1.docker.io',
    new Headers({
      'ratelimit-remaining': '0;w=3600',
      'ratelimit-limit': '100;w=3600',
    })
  )

  assert.equal(error.status, 429)
  assert.equal(error.retryAfter, 3600)
})

test('token-service throttling stays a 429 and prevents immediate authentication retries', async (context) => {
  const registry = connection('token-limit')
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++

    return requests === 1
      ? new Response(null, {
          status: 401,
          headers: {
            'WWW-Authenticate': `Bearer realm="${registry.url}/token",service="fixture"`,
          },
        })
      : new Response(null, { status: 429, headers: { 'Retry-After': '90' } })
  })

  await assert.rejects(
    registryRequest(registry, '/v2/'),
    (error: unknown) => error instanceof AppError && error.status === 429 && error.retryAfter === 90
  )
  await assert.rejects(registryRequest(registry, '/v2/'), /rate limit/)
  assert.equal(requests, 2)
})

test('CDN throttling pauses the source registry and never forwards registry credentials', async (context) => {
  const registry = connection('cdn-limit')
  const cdn = 'https://approved-cdn.example'
  const previous = env().REGISTRY_BLOB_ORIGINS
  let requests = 0

  env().REGISTRY_BLOB_ORIGINS = cdn

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      requests++

      const target = new URL(raw instanceof Request ? raw.url : String(raw))

      if (target.origin === new URL(cdn).origin) {
        assert.equal(new Headers(init?.headers).has('Authorization'), false)
        return new Response(null, { status: 429, headers: { 'Retry-After': '30' } })
      }

      return new Response(null, { status: 307, headers: { Location: `${cdn}/blob` } })
    }
  )

  try {
    await assert.rejects(
      registryRequest(registry, `/v2/team/app/blobs/${digest}`),
      (error: unknown) =>
        error instanceof AppError && error.status === 429 && error.retryAfter === 30
    )
    await assert.rejects(registryRequest(registry, '/v2/'), /rate limit/)
    assert.equal(requests, 2)
  } finally {
    env().REGISTRY_BLOB_ORIGINS = previous
  }
})

test('Docker Hub listing throttles honour Retry-After and do not repeat upstream requests', async (context) => {
  const registry = {
    ...connection('listing-limit'),
    url: 'https://registry-1.docker.io',
    provider: 'dockerhub' as const,
    namespace: 'team',
  }
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return new Response(null, { status: 429, headers: { 'Retry-After': '150' } })
  })

  await assert.rejects(
    dockerHubPage(registry, { last: '', n: 100 }),
    (error: unknown) =>
      error instanceof AppError && error.status === 429 && error.retryAfter === 150
  )
  await assert.rejects(dockerHubPage(registry, { last: '', n: 100 }), /rate limit/)
  assert.equal(requests, 1)
})

test('digest discovery uses HEAD and cannot consume or replace the GET response cache', async (context) => {
  const registry = connection('head-cache')
  const methods: string[] = []
  const manifestPath = '/v2/team/app/manifests/latest'

  context.mock.method(globalThis, 'fetch', async (_raw: unknown, init?: RequestInit) => {
    methods.push(init?.method ?? 'GET')

    return new Response(init?.method === 'HEAD' ? null : 'manifest body', {
      headers: { 'Docker-Content-Digest': digest },
    })
  })

  assert.equal(await imageDigest(registry, 'team/app', 'latest'), digest)
  assert.equal((await registryRequest(registry, manifestPath)).text, 'manifest body')
  assert.equal(await imageDigest(registry, 'team/app', 'latest'), digest)
  assert.equal((await registryRequest(registry, manifestPath)).text, 'manifest body')
  assert.deepEqual(methods, ['HEAD', 'GET', 'HEAD'])
})

test('HEAD fallback verifies manifest bytes and never falls back after throttling', async (context) => {
  const registry = connection('head-fallback')
  const manifest = JSON.stringify({ schemaVersion: 2, layers: [] })
  const expected = `sha256:${createHash('sha256').update(manifest).digest('hex')}`
  const methods: string[] = []

  context.mock.method(globalThis, 'fetch', async (_raw: unknown, init?: RequestInit) => {
    methods.push(init?.method ?? 'GET')

    return init?.method === 'HEAD'
      ? new Response(null, { status: 405 })
      : new Response(manifest, { headers: { 'Docker-Content-Digest': expected } })
  })

  assert.equal(await imageDigest(registry, 'team/app', 'latest'), expected)
  assert.deepEqual(methods, ['HEAD', 'GET'])

  const blocked = connection('head-throttled')
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return new Response(null, { status: 429 })
  })

  await assert.rejects(
    imageDigest(blocked, 'team/app', 'latest'),
    (error: unknown) => error instanceof AppError && error.status === 429
  )
  assert.equal(requests, 1)
})

test('HEAD digest responses reject a different immutable reference', async (context) => {
  const registry = connection('head-mismatch')

  context.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(null, { headers: { 'Docker-Content-Digest': `sha256:${'b'.repeat(64)}` } })
  )

  await assert.rejects(imageDigest(registry, 'team/app', digest), /requested digest/)
})

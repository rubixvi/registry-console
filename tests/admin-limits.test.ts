import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, test } from 'node:test'

import { database } from '../src/lib/database/client'
import { registryRequest } from '../src/lib/registry/client'
import { hubPage } from '../src/lib/registry/dockerhub'
import { checkBackoff, limitRegistry } from '../src/lib/registry/throttle'
import { loadToken } from '../src/lib/registry/token-cache'
import { hasLimits, withLimits } from '../src/lib/security/context'
import { AppError } from '../src/lib/security/error'
import { rateLimit } from '../src/lib/security/rate-limit'
import { type RegistryRecord } from '../src/types/registry'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-admin-limits-'))
const registry: RegistryRecord = {
  id: 'admin-limits',
  name: 'Docker Hub',
  provider: 'dockerhub',
  namespace: 'team',
  url: 'https://registry-1.docker.io',
  pullUrl: '',
  username: '',
  password: '',
  readOnly: true,
}

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'e'.repeat(64),
  REGISTRY_ALLOWED_ORIGINS: '',
})

beforeEach(() => {
  const globals = globalThis as typeof globalThis & {
    registryConsoleBackoffs?: Map<string, number>
  }

  globals.registryConsoleBackoffs?.clear()
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

test('authentication limits remain enforced when operational cooldowns are disabled', () => {
  withLimits(false, () => {
    rateLimit('security-verify:admin', 1, 60_000)
    assert.throws(() => rateLimit('security-verify:admin', 1, 60_000), /Too many requests/)
  })
})

test('limit contexts stay isolated across concurrent requests and restore after failures', async () => {
  assert.equal(hasLimits(), true)

  await Promise.all([
    withLimits(false, async () => {
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.equal(hasLimits(), false)

      assert.throws(
        () =>
          withLimits(true, () => {
            assert.equal(hasLimits(), true)
            throw new Error('test failure')
          }),
        /test failure/
      )

      assert.equal(hasLimits(), false)
    }),
    withLimits(true, async () => {
      await Promise.resolve()
      assert.equal(hasLimits(), true)
    }),
  ])

  assert.equal(hasLimits(), true)
})

test('admins retry upstream while viewers remain paused and cannot share a blocked request', async (context) => {
  let requests = 0

  limitRegistry(registry.url, new Headers({ 'Retry-After': '120' }))
  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return new Response('available', { headers: { 'Cache-Control': 'no-store' } })
  })

  const paused = registryRequest(registry, '/v2/team/app/manifests/edge')
  const resumed = withLimits(false, () => registryRequest(registry, '/v2/team/app/manifests/edge'))

  await assert.rejects(paused, /paused locally/)
  assert.equal((await resumed).text, 'available')
  assert.equal(requests, 1)
  assert.throws(() => checkBackoff(registry.url), /paused locally/)
})

test('admins still receive genuine upstream 429 responses with the current retry interval', async (context) => {
  let requests = 0

  limitRegistry(registry.url, new Headers({ 'Retry-After': '3600' }))
  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return requests === 1
      ? new Response('private upstream diagnostics', {
          status: 429,
          headers: { 'Retry-After': '15' },
        })
      : new Response('available')
  })

  await withLimits(false, async () => {
    await assert.rejects(registryRequest(registry, '/v2/'), (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.status, 429)
      assert.equal(error.retryAfter, 15)
      assert.match(error.message, /Docker Hub registry returned HTTP 429/)
      assert.equal(error.message.includes('private'), false)
      return true
    })

    assert.equal((await registryRequest(registry, '/v2/')).text, 'available')
  })

  assert.equal(requests, 2)
})

test('admins bypass Hub API cooldowns while background operations retain them', async (context) => {
  let requests = 0

  limitRegistry('https://hub.docker.com', new Headers({ 'Retry-After': '90' }))
  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return Response.json(
      { results: [{ name: 'app' }], next: null },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  })

  await withLimits(false, async () => {
    assert.deepEqual(await hubPage(registry, { last: '', n: 100 }), {
      items: ['team/app'],
      next: null,
    })

    await assert.rejects(
      withLimits(true, () => hubPage(registry, { last: '', n: 100 })),
      /Docker Hub API requests are paused locally/
    )
  })

  assert.equal(requests, 1)
})

test('admin authentication requests cannot inherit a pending background cooldown failure', async () => {
  const key = 'independent-authentication'
  const origin = 'https://auth.docker.io'

  limitRegistry(origin, new Headers({ 'Retry-After': '60' }))

  const load = async () => {
    checkBackoff(origin)
    return 'token'
  }
  const paused = loadToken(key, load)
  const resumed = withLimits(false, () => loadToken(key, load))

  await assert.rejects(paused, /Docker Hub authentication requests are paused locally/)
  assert.equal(await resumed, 'token')
})

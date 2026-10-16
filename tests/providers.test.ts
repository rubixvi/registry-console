import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { validateBlobRedirect } from '../src/lib/registry/allowlist'
import { invalidateRegistry } from '../src/lib/registry/cache'
import { registryRequest } from '../src/lib/registry/client'
import { deleteManifest } from '../src/lib/registry/delete'
import { assertDockerHubRepository, dockerHubPage } from '../src/lib/registry/dockerhub'
import { dockerHubSettings } from '../src/lib/registry/dockerhub-settings'
import { imageDetails } from '../src/lib/registry/image'
import { tokenKey } from '../src/lib/registry/token-cache'
import { encryptSecret } from '../src/lib/security/crypto'
import { keyedFingerprint } from '../src/lib/security/fingerprint'
import { type RegistryRecord } from '../src/types/registry'

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  ENCRYPTION_KEY: 'e'.repeat(64),
  REGISTRY_ALLOWED_ORIGINS: 'https://registry-1.docker.io,https://hub.docker.com',
  REGISTRY_TOKEN_ORIGINS: 'https://auth.docker.io',
  REGISTRY_BLOB_ORIGINS: 'https://cdn.example.com',
})

function registry(id: string): RegistryRecord {
  return {
    id,
    name: 'Docker Hub',
    provider: 'dockerhub',
    namespace: 'team',
    url: 'https://registry-1.docker.io',
    pullUrl: '',
    username: 'reader',
    password: encryptSecret('a-private-access-token'),
    readOnly: true,
  }
}

test('keyed identifiers are separated by purpose, credentials, and scope', () => {
  const value = registry('fingerprint')

  assert.equal(tokenKey(value), tokenKey(value))
  assert.notEqual(tokenKey(value), tokenKey({ ...value, password: encryptSecret('changed') }))
  assert.notEqual(tokenKey(value, 'pull'), tokenKey(value, 'delete'))
  assert.notEqual(
    keyedFingerprint('cache', { id: value.id }),
    keyedFingerprint('plan', { id: value.id })
  )
  assert.notEqual(
    keyedFingerprint('cache', { id: value.id }),
    createHash('sha256').update(JSON.stringify(value)).digest('hex')
  )
})

test('Docker Hub uses a fixed API origin, bearer authentication, namespace mapping, and safe pagination', async (context) => {
  const value = registry('hub-pages')
  const seen: string[] = []

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))

      seen.push(url.toString())
      assert.equal(url.origin, 'https://hub.docker.com')
      assert.equal(init?.redirect, 'manual')

      if (url.pathname === '/v2/auth/token') {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          identifier: 'reader',
          secret: 'a-private-access-token',
        })

        return Response.json({ access_token: 'hub-token' })
      }

      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer hub-token')

      return Response.json({
        results: [{ name: url.searchParams.get('page') === '2' ? 'worker' : 'app' }],
        next:
          url.searchParams.get('page') === '2'
            ? null
            : 'https://hub.docker.com/v2/namespaces/team/repositories?page=2&page_size=1',
      })
    }
  )

  const first = await dockerHubPage(value, { last: '', n: 1 })
  const second = await dockerHubPage(value, { last: first.next!, n: 1 })

  assert.deepEqual(first, { items: ['team/app'], next: '2' })
  assert.deepEqual(second, { items: ['team/worker'], next: null })
  assert.equal(seen.filter((url) => url.endsWith('/v2/auth/token')).length, 1)
  assert.equal((await dockerHubPage(value, { last: '', n: 1 })).items[0], 'team/app')
  assert.equal(seen.length, 3)
})

test('Docker Hub rejects foreign pagination, namespace escapes, invalid origins, and deletions', async (context) => {
  const value = { ...registry('hub-bad'), username: '', password: '' }

  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      results: [{ name: 'app' }],
      next: 'https://hub.docker.com.attacker.example/v2/namespaces/team/repositories?page=2',
    })
  )

  await assert.rejects(dockerHubPage(value, { last: '', n: 10 }), /pagination/)
  assert.throws(() => assertDockerHubRepository(value, 'other/private'), /namespace/)
  assert.throws(
    () =>
      dockerHubSettings({ ...value, url: 'https://attacker.example' }, 'https://attacker.example'),
    /must use/
  )
  await assert.rejects(
    deleteManifest({ ...value, readOnly: false }, 'team/app', `sha256:${'a'.repeat(64)}`, 'admin'),
    /read only/
  )
})

test('configuration CDN redirects require an exact approved HTTPS origin and strip authorization', async (context) => {
  const value = registry('hub-cdn')
  const config = JSON.stringify({
    os: 'linux',
    architecture: 'amd64',
    created: '2026-10-01T00:00:00Z',
  })
  const digest = `sha256:${createHash('sha256').update(config).digest('hex')}`
  let requests = 0

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))

      requests++

      if (url.origin === 'https://cdn.example.com') {
        assert.equal(new Headers(init?.headers).get('authorization'), null)
        assert.equal(init?.redirect, 'manual')

        return new Response(config)
      }

      if (url.pathname.includes('/manifests/')) {
        return Response.json({
          schemaVersion: 2,
          config: { digest, size: Buffer.byteLength(config) },
          layers: [],
        })
      }

      return new Response(null, {
        status: 307,
        headers: { Location: 'https://cdn.example.com/blob?signed=value' },
      })
    }
  )

  const details = await imageDetails(value, 'team/app', 'latest')

  assert.equal(details.platforms[0], 'linux/amd64')
  assert.equal(requests, 3)

  for (const url of [
    'http://cdn.example.com/blob',
    'https://cdn.example.com.attacker.test/blob',
    'https://user:password@cdn.example.com/blob',
    'https://169.254.169.254/metadata',
  ]) {
    assert.throws(() => validateBlobRedirect(url), /origin/)
  }

  invalidateRegistry(value.id)

  context.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(null, {
        status: 307,
        headers: { Location: 'https://attacker.example/manifest' },
      })
  )

  await assert.rejects(
    registryRequest(value, '/v2/team/app/manifests/latest'),
    /redirects are blocked/
  )
})

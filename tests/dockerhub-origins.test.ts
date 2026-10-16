import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { env } from '../src/lib/config/env'
import { database } from '../src/lib/database/client'
import { validateBlobRedirect, validateToken, validateUrl } from '../src/lib/registry/allowlist'
import { dockerHubPage } from '../src/lib/registry/dockerhub'
import {
  DOCKER_HUB_API,
  DOCKER_HUB_AUTH,
  DOCKER_HUB_BLOBS,
  DOCKER_HUB_REGISTRY,
} from '../src/lib/registry/dockerhub-settings'
import { imageDetails } from '../src/lib/registry/image'
import { addRegistry, getRegistry, seedRegistry, updateRegistry } from '../src/lib/registry/store'
import { encryptSecret } from '../src/lib/security/crypto'
import { type RegistryRecord } from '../src/types/registry'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-hub-origins-'))

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'e'.repeat(64),
  REGISTRY_ALLOWED_ORIGINS: '',
  REGISTRY_TOKEN_ORIGINS: '',
  REGISTRY_BLOB_ORIGINS: '',
  ALLOW_HTTP_REGISTRIES: 'false',
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

function connection(id: string): RegistryRecord {
  return {
    id,
    name: 'Hub',
    url: DOCKER_HUB_REGISTRY,
    provider: 'dockerhub',
    namespace: 'team',
    pullUrl: '',
    username: 'reader',
    password: encryptSecret('access-token'),
    readOnly: true,
  }
}

test('Docker Hub registry origins work without a provider or allowlist while custom origins remain restricted', () => {
  const id = addRegistry({
    name: 'Hub',
    url: DOCKER_HUB_REGISTRY,
    provider: 'dockerhub',
    namespace: 'team',
    pullUrl: '',
    username: '',
    password: '',
    readOnly: false,
  })

  assert.equal(getRegistry(id).url, DOCKER_HUB_REGISTRY)
  assert.equal(getRegistry(id).readOnly, true)
  assert.equal(validateUrl(DOCKER_HUB_API, 'dockerhub'), DOCKER_HUB_API)
  assert.equal(validateUrl(DOCKER_HUB_REGISTRY), DOCKER_HUB_REGISTRY)
  assert.equal(validateUrl(DOCKER_HUB_REGISTRY, 'distribution'), DOCKER_HUB_REGISTRY)
  assert.throws(() => validateUrl(DOCKER_HUB_API, 'distribution'), /REGISTRY_ALLOWED_ORIGINS/)
  assert.throws(
    () => validateUrl('https://attacker.example', 'dockerhub'),
    /REGISTRY_ALLOWED_ORIGINS/
  )
  assert.throws(() => validateUrl('http://registry-1.docker.io', 'dockerhub'), /HTTP registries/)
})

test('automatic token trust is limited to the Docker Hub connection and official token path', () => {
  assert.equal(
    validateToken(`${DOCKER_HUB_AUTH}/token`, DOCKER_HUB_REGISTRY).origin,
    DOCKER_HUB_AUTH
  )

  for (const url of [
    `${DOCKER_HUB_AUTH}/other`,
    'https://auth.docker.io.attacker.example/token',
    'https://user:password@auth.docker.io/token',
    'http://auth.docker.io/token',
    'https://auth.docker.io:444/token',
    'https://169.254.169.254/token',
  ]) {
    assert.throws(() => validateToken(url, DOCKER_HUB_REGISTRY), /not permitted/)
  }

  assert.throws(
    () => validateToken(`${DOCKER_HUB_AUTH}/token`, 'https://other.example'),
    /not permitted/
  )
})

test('automatic blob trust uses exact HTTPS origins and cannot be reused by another registry', () => {
  for (const origin of DOCKER_HUB_BLOBS) {
    const url = `${origin}/blob?signed=value`

    assert.equal(validateBlobRedirect(url, DOCKER_HUB_REGISTRY).origin, origin)
    assert.throws(() => validateBlobRedirect(url), /REGISTRY_BLOB_ORIGINS/)
    assert.throws(() => validateBlobRedirect(url, 'https://other.example'), /REGISTRY_BLOB_ORIGINS/)
  }

  for (const url of [
    'http://production.cloudfront.docker.com/blob',
    'https://production.cloudfront.docker.com.attacker.example/blob',
    'https://production.cloudflare.docker.com:444/blob',
    'https://user:password@production.cloudflare.docker.com/blob',
    'https://attacker.r2.cloudflarestorage.com/blob',
    'https://169.254.169.254/blob',
  ]) {
    assert.throws(() => validateBlobRedirect(url, DOCKER_HUB_REGISTRY), /REGISTRY_BLOB_ORIGINS/)
  }
})

test('explicit custom registry, token and blob allowlists still work', () => {
  const config = env()
  const previous = {
    registry: config.REGISTRY_ALLOWED_ORIGINS,
    token: config.REGISTRY_TOKEN_ORIGINS,
    blob: config.REGISTRY_BLOB_ORIGINS,
  }

  try {
    config.REGISTRY_ALLOWED_ORIGINS = 'https://registry.example.com'
    config.REGISTRY_TOKEN_ORIGINS = 'https://tokens.example.com'
    config.REGISTRY_BLOB_ORIGINS = 'https://cdn.example.com'

    assert.equal(validateUrl('https://registry.example.com'), 'https://registry.example.com')
    assert.equal(
      validateToken('https://tokens.example.com/token', 'https://registry.example.com').origin,
      'https://tokens.example.com'
    )
    assert.equal(
      validateBlobRedirect('https://cdn.example.com/blob').origin,
      'https://cdn.example.com'
    )
  } finally {
    config.REGISTRY_ALLOWED_ORIGINS = previous.registry
    config.REGISTRY_TOKEN_ORIGINS = previous.token
    config.REGISTRY_BLOB_ORIGINS = previous.blob
  }
})

test('Docker Hub listings need no manual API allowlist entry', async (context) => {
  const value = { ...connection('hub-auto-list'), username: '', password: '' }

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))

    assert.equal(url.origin, DOCKER_HUB_API)

    return Response.json({ results: [{ name: 'app' }], next: null })
  })

  assert.deepEqual(await dockerHubPage(value, { last: '', n: 100 }), {
    items: ['team/app'],
    next: null,
  })
})

test('Docker Hub image metadata authenticates and follows its CDN without forwarding credentials', async (context) => {
  const value = connection('hub-auto-metadata')
  const configuration = JSON.stringify({
    os: 'linux',
    architecture: 'amd64',
    created: '2026-10-16T12:30:00Z',
  })
  const digest = `sha256:${createHash('sha256').update(configuration).digest('hex')}`
  const manifest = JSON.stringify({
    schemaVersion: 2,
    config: { digest, size: Buffer.byteLength(configuration) },
    layers: [],
  })
  const manifestDigest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`
  let challenges = 0
  let redirects = 0

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))
      const headers = new Headers(init?.headers)

      assert.equal(init?.redirect, 'manual')

      if (url.origin === DOCKER_HUB_AUTH) {
        assert.equal(url.pathname, '/token')
        assert.equal(url.searchParams.get('scope'), 'repository:team/app:pull')
        assert.equal(
          headers.get('authorization'),
          `Basic ${Buffer.from('reader:access-token').toString('base64')}`
        )

        return Response.json({ token: 'registry-token', expires_in: 300 })
      }

      if (url.origin === 'https://production.cloudfront.docker.com') {
        redirects++
        assert.equal(headers.get('authorization'), null)

        return new Response(configuration)
      }

      assert.equal(url.origin, DOCKER_HUB_REGISTRY)

      if (headers.get('authorization') !== 'Bearer registry-token') {
        challenges++

        return new Response(null, {
          status: 401,
          headers: {
            'WWW-Authenticate': `Bearer realm="${DOCKER_HUB_AUTH}/token",service="registry.docker.io"`,
          },
        })
      }

      if (url.pathname.includes('/manifests/')) {
        return new Response(manifest, { headers: { 'Docker-Content-Digest': manifestDigest } })
      }

      return new Response(null, {
        status: 307,
        headers: { Location: 'https://production.cloudfront.docker.com/config?signed=value' },
      })
    }
  )

  for (const provider of ['dockerhub', 'distribution', undefined] as const) {
    const registry = { ...value, id: `hub-metadata-${provider}`, provider }
    const result = await imageDetails(registry, 'team/app', 'edge')

    assert.equal(result.verified, true)
    assert.equal(result.digest, manifestDigest)
    assert.equal(result.created, '2026-10-16T12:30:00.000Z')
    assert.deepEqual(result.platforms, ['linux/amd64'])
  }

  assert.equal(challenges, 3)
  assert.equal(redirects, 3)
})

test('Docker Hub connection creation, updates, reads and seeding need no origin entry', () => {
  const input = {
    name: 'Legacy Hub',
    url: DOCKER_HUB_REGISTRY,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: true,
  }
  const id = addRegistry(input)

  assert.equal(getRegistry(id).url, DOCKER_HUB_REGISTRY)
  updateRegistry(id, { ...input, name: 'Updated Hub' })
  assert.equal(getRegistry(id).name, 'Updated Hub')

  const previous = {
    url: process.env.REGISTRY_URL,
    password: process.env.REGISTRY_PASSWORD_ENCRYPTED,
    username: process.env.REGISTRY_USERNAME,
  }

  try {
    process.env.REGISTRY_URL = DOCKER_HUB_REGISTRY
    process.env.REGISTRY_PASSWORD_ENCRYPTED = ''
    process.env.REGISTRY_USERNAME = ''

    seedRegistry()

    const row = database()
      .prepare('SELECT id FROM registries WHERE url = ? AND id <> ?')
      .get(DOCKER_HUB_REGISTRY, id) as { id: string }

    assert.ok(row)
    assert.equal(getRegistry(row.id).url, DOCKER_HUB_REGISTRY)
    assert.ok(database().prepare("SELECT id FROM settings WHERE id = 'registry-seeded'").get())
  } finally {
    for (const [key, value] of [
      ['REGISTRY_URL', previous.url],
      ['REGISTRY_PASSWORD_ENCRYPTED', previous.password],
      ['REGISTRY_USERNAME', previous.username],
    ]) {
      if (value === undefined) delete process.env[key!]
      else process.env[key!] = value
    }
  }
})

test('built-in registry trust never accepts lookalikes, credentials, paths or nonstandard ports', () => {
  for (const origin of [
    'https://registry-1.docker.io.attacker.example',
    'https://registry-1.docker.io:444',
    'https://user:password@registry-1.docker.io',
    'https://registry-1.docker.io/v2/',
    'https://registry-1.docker.io?origin=trusted',
    'https://registry-1.docker.io#fragment',
    'https://attacker.example',
    'https://169.254.169.254',
  ]) {
    assert.throws(() => validateUrl(origin))
  }

  assert.equal(validateUrl('https://registry-1.docker.io/'), DOCKER_HUB_REGISTRY)
})

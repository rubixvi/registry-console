import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { database } from '../src/lib/database/client'
import { claimScan } from '../src/lib/database/scan'
import { requireRepository } from '../src/lib/registry/access'
import { registryPage } from '../src/lib/registry/catalog'
import { registryRequest } from '../src/lib/registry/client'
import { imageManifest } from '../src/lib/registry/image'
import { imageMetadata } from '../src/lib/registry/metadata'
import { searchRegistry } from '../src/lib/registry/search'
import { scanStatus } from '../src/lib/registry/trivy'
import { hasRole, withIdentity } from '../src/lib/security/access'
import { decryptSecret, encryptSecret } from '../src/lib/security/crypto'
import { AppError } from '../src/lib/security/error'
import { type RegistryRecord } from '../src/types/registry'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-visibility-'))
const viewer = { username: 'public-reader', role: 'viewer' as const }
const member = { username: 'reader', role: 'member' as const }

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'b'.repeat(64),
  REGISTRY_ALLOWED_ORIGINS: 'https://registry.example.com',
  TRIVY_ENABLED: 'true',
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

function registry(id: string): RegistryRecord {
  return {
    id,
    url: 'https://registry.example.com',
    name: 'Registry',
    provider: 'distribution',
    namespace: '',
    username: 'robot',
    password: encryptSecret('private-connection-secret'),
    pullUrl: '',
    readOnly: false,
  }
}

test('viewer catalogues and searches hide private repositories and pagination does not reveal their names', async (context) => {
  const value = registry('catalogue')
  let anonymous = 0

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))
      const auth = new Headers(init?.headers).get('authorization')

      if (url.pathname === '/v2/_catalog') {
        assert.equal(
          auth,
          `Basic ${Buffer.from('robot:private-connection-secret').toString('base64')}`
        )
        return Response.json(
          { repositories: url.searchParams.get('last') ? ['team/public'] : ['team/private'] },
          {
            headers: url.searchParams.get('last')
              ? {}
              : {
                  Link: `<https://registry.example.com/v2/_catalog?last=team%2Fprivate&n=${url.searchParams.get('n')}>; rel="next"`,
                },
          }
        )
      }

      assert.equal(auth, null)
      anonymous++

      return url.pathname.includes('/public/')
        ? Response.json({ name: 'team/public', tags: ['latest'] })
        : new Response(null, { status: 403 })
    }
  )

  await withIdentity(viewer, async () => {
    const page = await registryPage(value, { last: '', n: 1 })

    assert.deepEqual(page.items, [])
    assert.ok(page.next)
    assert.ok(!page.next.includes('private'))
    assert.equal(JSON.parse(decryptSecret(page.next)).last, 'team/private')
    assert.deepEqual((await registryPage(value, { last: page.next, n: 1 })).items, ['team/public'])
    await assert.rejects(registryPage(value, { last: 'team/private', n: 1 }), /cursor/)
    await assert.rejects(
      registryPage({ ...value, id: 'other-connection' }, { last: page.next, n: 1 }),
      /cursor/
    )
    assert.deepEqual(await searchRegistry(value, {}), { items: ['team/public'] })
  })

  assert.equal(anonymous, 2)
  await withIdentity(member, async () => {
    assert.deepEqual((await registryPage(value, { last: '', n: 1 })).items, ['team/private'])
  })
})

test('cached private manifests and direct metadata or registry requests cannot bypass viewer checks', async (context) => {
  const value = registry('cached-private')
  const body = JSON.stringify({
    schemaVersion: 2,
    config: { digest: `sha256:${'a'.repeat(64)}`, size: 1 },
    layers: [],
  })
  const digest = `sha256:${createHash('sha256').update(body).digest('hex')}`
  let manifests = 0

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))

    if (url.pathname.endsWith('/tags/list')) return new Response(null, { status: 403 })
    manifests++

    return new Response(body, { headers: { 'docker-content-digest': digest } })
  })

  await withIdentity(member, () => imageManifest(value, 'team/private', digest))
  assert.equal(manifests, 1)
  await withIdentity(viewer, async () => {
    for (const task of [
      () => imageManifest(value, 'team/private', digest),
      () => imageMetadata(value, 'team/private', 'latest'),
      () => registryPage(value, { repository: 'team/private', last: '', n: 100 }),
      () => registryRequest(value, `/v2/team/private/manifests/${digest}`),
    ])
      await assert.rejects(
        task(),
        (error: unknown) =>
          error instanceof AppError && error.status === 404 && !error.message.includes('private')
      )
  })
  assert.equal(manifests, 1)
})

test('Docker Hub visibility is checked again for each request and unknown privacy is hidden', async (context) => {
  const value: RegistryRecord = {
    ...registry('hub-public'),
    provider: 'dockerhub',
    namespace: 'team',
    url: 'https://registry-1.docker.io',
    username: '',
    password: '',
  }
  let visibility: boolean | undefined = false
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return Response.json({
      name: 'app',
      namespace: 'team',
      ...(visibility === undefined ? {} : { is_private: visibility }),
    })
  })

  await withIdentity(viewer, async () => {
    await requireRepository(value, 'team/app')
    await requireRepository(value, 'team/app')
  })
  assert.equal(requests, 1)
  visibility = true
  await assert.rejects(
    withIdentity(viewer, () => requireRepository(value, 'team/app')),
    /not found/
  )
  visibility = undefined
  await assert.rejects(
    withIdentity(viewer, () => requireRepository(value, 'team/app')),
    /not found/
  )
  assert.equal(requests, 3)
})

test('GitHub public, private and internal packages are classified explicitly and uncertain results deny viewers', async (context) => {
  const value: RegistryRecord = {
    ...registry('github-public'),
    provider: 'github',
    namespace: 'team',
    url: 'https://ghcr.io',
  }
  let visibility = 'public'

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))

    if (url.pathname === '/users/team')
      return Response.json({ login: 'team', type: 'Organization' })
    assert.equal(url.pathname, '/orgs/team/packages/container/app%2Fnested')

    return Response.json({ name: 'app/nested', owner: { login: 'team' }, visibility })
  })

  await withIdentity(viewer, () => requireRepository(value, 'team/app/nested'))
  for (const state of ['private', 'internal', 'unknown']) {
    visibility = state
    await assert.rejects(
      withIdentity(viewer, () => requireRepository(value, 'team/app/nested')),
      /not found/
    )
  }

  await withIdentity(member, () => requireRepository(value, 'team/app/nested'))
})

test('viewer scan feedback cannot reveal a private active image or its actor', () => {
  const value = registry('scan-redaction')
  const digest = `sha256:${'b'.repeat(64)}`

  claimScan({
    id: 'private-active-scan',
    registryId: 'private-connection',
    repository: 'secret/image',
    digest: `sha256:${'c'.repeat(64)}`,
    actor: 'private-admin',
    expires: Date.now() + 60_000,
  })
  const status = withIdentity(viewer, () => scanStatus(value, 'team/public', digest))

  assert.ok(status.busy)
  assert.equal(status.busy.repository, '')
  assert.equal(status.busy.digest, '')
  assert.equal(status.busy.actor, 'system:trivy')
  assert.ok(!JSON.stringify(status).includes('secret/image'))
  assert.equal(hasRole(member.role, 'admin'), false)
  assert.equal(hasRole('admin', 'member'), true)
})

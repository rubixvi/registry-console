import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, test } from 'node:test'

import { database } from '../src/lib/database/client'
import { getScan, pendingScan } from '../src/lib/database/scan'
import { cachedResponse, cacheGeneration, rememberResponse } from '../src/lib/registry/cache'
import { deleteManifest, executeDeletion, previewDeletion } from '../src/lib/registry/delete'
import { hubPage, hubPrivacy } from '../src/lib/registry/dockerhub'
import { requirePublic } from '../src/lib/registry/scan-policy'
import { addRegistry, getRegistries, getRegistry, updateRegistry } from '../src/lib/registry/store'
import {
  executeTrivy,
  prepareScan,
  runScan,
  scanTarget,
  scheduleScan,
  startScan,
} from '../src/lib/registry/trivy'
import { scanPending } from '../src/lib/registry/trivy/worker'
import { discoverRegistry, discoveryScope } from '../src/lib/registry/trivy-discovery'
import { withLimits } from '../src/lib/security/context'
import { AppError } from '../src/lib/security/error'
import { type RegistryRecord } from '../src/types/registry'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-hub-policy-'))
const manifest = JSON.stringify({ schemaVersion: 2, layers: [] })
const digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`
const input = {
  name: 'Docker Hub',
  provider: 'dockerhub' as const,
  namespace: 'team',
  url: 'https://registry-1.docker.io',
  pullUrl: '',
  username: '',
  password: '',
  readOnly: false,
}

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'd'.repeat(64),
  TRIVY_ENABLED: 'true',
  TRIVY_PATH: process.execPath,
})

function connection(): RegistryRecord {
  return getRegistry(addRegistry(input))
}

function attempts(): number {
  return Number(database().prepare('SELECT COUNT(*) AS count FROM scan_attempts').get()!.count)
}

beforeEach(() => {
  for (const table of [
    'image_scans',
    'scan_queue',
    'scan_attempts',
    'scan_discovery',
    'scan_workers',
  ]) {
    database().exec(`DELETE FROM ${table}`)
  }
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

test('Hub repository listings retain privacy and reuse it without another API request', async (context) => {
  const registry = connection()
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return Response.json({
      results: [
        { name: 'public', namespace: 'team', is_private: false },
        { name: 'private', namespace: 'team', is_private: true },
      ],
      next: null,
    })
  })

  assert.deepEqual((await hubPage(registry, { last: '', n: 100 })).items, [
    'team/public',
    'team/private',
  ])
  assert.equal(await hubPrivacy(registry, 'team/public'), false)
  assert.equal(await hubPrivacy(registry, 'team/private'), true)
  assert.equal(requests, 1)
})

test('private Hub repositories cannot start scans or spend scan attempts, including admin overrides', async (context) => {
  const registry = connection()
  let requests = 0

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    requests++
    assert.equal(new URL(String(raw)).origin, 'https://hub.docker.com')
    return Response.json({ name: 'private', namespace: 'team', is_private: true })
  })

  await assert.rejects(startScan(registry, 'team/private', digest, 'admin'), /Private Docker Hub/)
  await assert.rejects(
    withLimits(false, () => startScan(registry, 'team/private', digest, 'admin', true)),
    /Private Docker Hub/
  )
  assert.equal(attempts(), 0)
  assert.equal(requests, 2)
})

test('unknown, malformed, inaccessible and mismatched visibility never grants scan access', async (context) => {
  const registry = connection()
  let response = () => Response.json({ name: 'app' })

  context.mock.method(globalThis, 'fetch', async () => response())

  for (const invalid of [
    () => Response.json({ name: 'app' }),
    () => Response.json({ name: 'app', is_private: 'false' }),
    () => Response.json({ name: 'other', is_private: false }),
    () => Response.json({ name: 'app', namespace: 'other', is_private: false }),
    () => new Response('invalid JSON'),
    () => new Response(null, { status: 403 }),
  ]) {
    response = invalid
    await assert.rejects(
      requirePublic(registry, 'team/app'),
      (error: unknown) => error instanceof AppError && error.status === 503
    )
  }

  assert.equal(attempts(), 0)
})

test('legacy Docker Hub connections are subject to the same private scan policy', async (context) => {
  const registry = { ...connection(), provider: 'distribution' as const, namespace: '' }

  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ name: 'app', is_private: true })
  )

  assert.equal(await hubPrivacy(registry, 'team/app'), true)
  await assert.rejects(requirePublic(registry, 'team/app'), /Private Docker Hub/)
})

test('privacy is refreshed before execution and private images never spawn Trivy', async (context) => {
  const registry = connection()
  let isPrivate = false
  let spawns = 0

  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ name: 'app', is_private: isPrivate })
  )
  context.mock.method(childProcess, 'spawn', () => {
    spawns++
    throw new Error('Unexpected scanner execution')
  })
  syncBuiltinESMExports()

  try {
    assert.equal(await hubPrivacy(registry, 'team/app'), false)
    isPrivate = true
    await assert.rejects(
      executeTrivy(registry, 'team/app', digest, 'linux/amd64', 1000),
      /Private Docker Hub/
    )
    assert.equal(spawns, 0)
  } finally {
    context.mock.restoreAll()
    syncBuiltinESMExports()
  }
})

test('old private queue entries are discarded before metadata downloads or scan claims', async (context) => {
  const registry = connection()

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    assert.equal(new URL(String(raw)).origin, 'https://hub.docker.com')
    return Response.json({ name: 'app', is_private: true })
  })

  scheduleScan(registry, 'team/app', digest)
  await scanPending(scanTarget(registry, 'team/app', digest))

  assert.equal(pendingScan(), undefined)
  assert.equal(attempts(), 0)
})

test('queue entries wait without spending capacity when Hub visibility is unavailable', async (context) => {
  const registry = connection()

  context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }))
  scheduleScan(registry, 'team/app', digest)
  await scanPending(scanTarget(registry, 'team/app', digest))

  assert.equal(pendingScan(scanTarget(registry, 'team/app', digest).id)?.digest, digest)
  assert.equal(attempts(), 0)
})

test('confirmed public Hub images can claim scan capacity', async (context) => {
  const registry = connection()
  const config = JSON.stringify({ os: 'linux', architecture: 'amd64' })
  const configDigest = `sha256:${createHash('sha256').update(config).digest('hex')}`
  const manifest = JSON.stringify({
    schemaVersion: 2,
    config: { digest: configDigest, size: config.length },
    layers: [],
  })
  const digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))

    if (url.origin === 'https://hub.docker.com') {
      return Response.json({ name: 'app', is_private: false })
    }

    return url.pathname.includes('/blobs/') ? new Response(config) : new Response(manifest)
  })

  const job = await startScan(registry, 'team/app', digest, 'admin')

  assert.ok(job)
  assert.equal(attempts(), 1)
})

test('prepared jobs recheck privacy before downloading metadata', async (context) => {
  const registry = connection()
  const job = prepareScan(registry, 'team/app', digest, 'admin')

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    assert.equal(new URL(String(raw)).origin, 'https://hub.docker.com')
    return Response.json({ name: 'app', is_private: true })
  })

  await runScan(job)
  assert.equal(getScan(job.id)?.status, 'failed')
  assert.match(getScan(job.id)?.value ?? '', /Private Docker Hub/)
})

test('discovery skips private repositories before fetching their tags or digests', async (context) => {
  const registry = connection()
  const requests: string[] = []

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))
    requests.push(url.pathname)

    if (url.pathname.endsWith('/repositories')) {
      return Response.json({ results: [{ name: 'app', is_private: true }], next: null })
    }

    throw new Error('Private repository was inspected')
  })

  await discoverRegistry(registry, discoveryScope(registry), '{}', () => true)
  assert.deepEqual(requests, ['/v2/namespaces/team/repositories'])
  assert.equal(pendingScan(), undefined)
})

test('Docker Hub read-only access is an editable setting rather than a provider restriction', () => {
  const registry = connection()

  assert.equal(registry.readOnly, false)
  assert.equal(getRegistries().find((entry) => entry.id === registry.id)?.readOnly, false)
  updateRegistry(registry.id, { ...input, readOnly: true })
  assert.equal(getRegistry(registry.id).readOnly, true)
  updateRegistry(registry.id, input)
  assert.equal(getRegistry(registry.id).readOnly, false)
})

test('writable Hub deletions request delete scope, invalidate caches and audit success', async (context) => {
  const registry = connection()
  const path = `/v2/team/app/manifests/${encodeURIComponent(digest)}`
  const scope = 'repository:team/app:pull'
  let deleted = 0

  rememberResponse(
    registry,
    path,
    scope,
    { text: manifest, headers: new Headers() },
    cacheGeneration()
  )

  context.mock.method(
    globalThis,
    'fetch',
    async (raw: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(raw))

      if (url.origin === 'https://auth.docker.io') {
        assert.equal(url.searchParams.get('scope'), 'repository:team/app:pull,push,delete')
        return Response.json({ token: 'delete-token' })
      }

      assert.equal(url.pathname, path)
      assert.equal(init?.method, 'DELETE')
      if (!new Headers(init?.headers).has('Authorization')) {
        return new Response(null, {
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Bearer realm="https://auth.docker.io/token",service="registry.docker.io"',
          },
        })
      }

      deleted++
      return new Response(null, { status: 202 })
    }
  )

  await deleteManifest(registry, 'team/app', digest, 'admin')
  assert.equal(deleted, 1)
  assert.equal(cachedResponse(registry, path, scope), null)
  assert.equal(
    database()
      .prepare("SELECT actor FROM audit WHERE action = 'manifest.delete' AND target = ?")
      .get(`${registry.id}/team/app@${digest}`)?.actor,
    'admin'
  )
})

test('read-only and namespace guards reject Hub deletions before upstream access', async (context) => {
  const registry = connection()
  let requests = 0

  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return new Response(null, { status: 202 })
  })

  await assert.rejects(
    deleteManifest({ ...registry, readOnly: true }, 'team/app', digest, 'admin'),
    /read only/
  )
  await assert.rejects(deleteManifest(registry, 'other/app', digest, 'admin'), /namespace/)
  assert.equal(requests, 0)
})

test('Hub bulk deletion preserves upstream permission and reference failures', async (context) => {
  const registry = connection()

  context.mock.method(globalThis, 'fetch', async (raw: unknown, init?: RequestInit) =>
    new URL(String(raw)).pathname.endsWith('/tags')
      ? Response.json({ results: [{ name: 'latest' }], next: null })
      : init?.method === 'DELETE'
        ? new Response(null, { status: 403 })
        : new Response(manifest, { headers: { 'Docker-Content-Digest': digest } })
  )

  const plan = await previewDeletion(registry, 'team/app', ['latest'], 'admin', 'session')
  const result = await executeDeletion(registry, plan.id, 'team/app', 'admin', 'session')

  assert.equal(result.deleted, 0)
  assert.equal(result.failed, 1)
  assert.match(result.results[0].error ?? '', /Docker Hub denied deletion/)
  assert.match(result.results[0].error ?? '', /references/)
})

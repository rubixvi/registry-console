import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { mockBrowsing } from '../scripts/fixtures/mock-browsing'
import { env } from '../src/lib/config/env'
import { database } from '../src/lib/database/client'
import {
  cachedResponse,
  cacheGeneration,
  invalidateRegistry,
  rememberResponse,
} from '../src/lib/registry/cache'
import { registryRequest } from '../src/lib/registry/client'
import { imageDetails } from '../src/lib/registry/image'
import { registryListing } from '../src/lib/registry/listing'
import { addRegistry, getRegistry, removeRegistry, updateRegistry } from '../src/lib/registry/store'
import { encryptSecret } from '../src/lib/security/crypto'
import { envSchema } from '../src/lib/validation/env'
import { type RegistryRecord } from '../src/types/registry'
import { imageLabels } from '../src/utils/image-labels'
import { namespaceTree } from '../src/utils/namespace-tree'
import { isTagOrder, sortTags } from '../src/utils/tag-order'
import { selectTags } from '../src/utils/tag-selection'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-browsing-'))
let fixture: Awaited<ReturnType<typeof mockBrowsing>>
let registry: RegistryRecord
const manifestPath = '/v2/team/app/manifests/latest'
const scope = 'repository:team/app:pull'

before(async () => {
  fixture = await mockBrowsing()

  Object.assign(process.env, {
    APP_ORIGIN: 'https://console.example.com',
    DATA_DIR: directory,
    ENCRYPTION_KEY: 'c'.repeat(64),
    ALLOW_HTTP_REGISTRIES: 'true',
    REGISTRY_ALLOWED_ORIGINS: fixture.origin,
    HISTORY_CUSTOM_LABELS: 'com.example.team',
  })

  const id = addRegistry({
    name: 'Browsing',
    url: fixture.origin,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: false,
  })

  registry = getRegistry(id)
})

after(async () => {
  database().close()
  await fixture.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

test('namespace trees preserve nested and root repositories, including a repository with children', () => {
  const nodes = namespaceTree([
    'team/api',
    'team',
    'team/backend/api',
    'root',
    'team/api',
    '__proto__/app',
  ])
  const team = nodes.find((node) => node.path === 'team')!

  assert.equal(team.repository, true)
  assert.equal(
    team.children.find((node) => node.name === 'backend')?.children[0].path,
    'team/backend/api'
  )
  assert.equal(team.children.filter((node) => node.path === 'team/api').length, 1)
  assert.equal(nodes.find((node) => node.path === 'root')?.repository, true)
  assert.equal(nodes.find((node) => node.path === '__proto__')?.children[0].path, '__proto__/app')
})

test('natural and lexical orders are deterministic, reverse correctly, and do not modify the source', () => {
  const input = ['v10', 'v2', 'v1', 'v02', 'V2']

  assert.deepEqual(sortTags(input, 'natural-asc'), ['v1', 'v02', 'v2', 'V2', 'v10'])
  assert.deepEqual(sortTags(input, 'natural-desc'), sortTags(input, 'natural-asc').reverse())
  assert.deepEqual(sortTags(input, 'alpha-asc'), ['V2', 'v02', 'v1', 'v10', 'v2'])
  assert.deepEqual(sortTags(input, 'alpha-desc'), ['v2', 'v10', 'v1', 'v02', 'V2'])
  assert.deepEqual(input, ['v10', 'v2', 'v1', 'v02', 'V2'])
  assert.equal(isTagOrder('unexpected'), false)
})

test('selection ranges follow visible order, preserve other visible selections, and remove checked ranges', () => {
  const visible = ['v1', 'v2', 'v3', 'v4']

  assert.deepEqual(selectTags(visible, ['v1', 'hidden'], 'v4', 'v2'), visible)
  assert.deepEqual(selectTags(visible, visible, 'v4', 'v2'), ['v1'])
  assert.deepEqual(selectTags(visible, ['hidden'], 'v3', 'stale'), ['v3'])
  assert.deepEqual(selectTags(visible, ['v1'], 'missing'), ['v1'])
  assert.deepEqual(selectTags(visible, ['v4'], 'v1', 'v4'), visible)
})

test('standard and configured labels are extracted as text without inherited or unselected properties', () => {
  const labels = Object.assign(Object.create({ inherited: 'hidden' }), {
    'org.opencontainers.image.version': '1.0',
    custom: '<img onerror=example>',
    blank: '',
    invalid: 10,
  })
  const result = imageLabels({ config: { Labels: labels } }, [
    'custom',
    'inherited',
    'blank',
    'invalid',
    'custom',
  ])

  assert.deepEqual(result, [
    { name: 'org.opencontainers.image.version', value: '1.0' },
    { name: 'custom', value: '<img onerror=example>' },
  ])
  assert.deepEqual(imageLabels(null), [])
  assert.deepEqual(imageLabels({ config: { Labels: null } }), [])
  assert.equal(
    envSchema.safeParse({
      APP_ORIGIN: 'https://example.com',
      ENCRYPTION_KEY: 'a'.repeat(64),
      TAGLIST_ORDER: 'invalid',
    }).success,
    false
  )
})

test('complete listings follow upstream pages before global sorting and filtering', async () => {
  const catalogue = await registryListing(registry)
  const tags = await registryListing(registry, 'team/app')

  assert.equal(catalogue.items.length, 210)
  assert.ok(catalogue.items.includes('team/backend/api'))
  assert.equal(tags.items.length, 206)
  assert.deepEqual(
    sortTags(
      tags.items.filter((tag) => tag.startsWith('v')),
      'natural-asc'
    ).slice(0, 3),
    ['v1', 'v2', 'v3']
  )
  assert.ok((fixture.requests.get('/v2/_catalog') ?? 0) >= 3)
  assert.ok((fixture.requests.get('/v2/team/app/tags/list') ?? 0) >= 3)
})

test('listing refresh bypasses cached mutable pages, and looping pagination fails instead of returning partial data', async () => {
  fixture.state.repositories.push('new/repository')
  assert.equal((await registryListing(registry)).items.length, 210)
  assert.equal((await registryListing(registry, undefined, true)).items.length, 211)

  fixture.state.loop = true
  await assert.rejects(registryListing(registry, undefined, true), /repeated pagination cursor/)
  fixture.state.loop = false
  invalidateRegistry(registry.id)
})

test('oversized listings return an explicit error and never expose partial success', async () => {
  const original = fixture.state.repositories
  fixture.state.repositories = Array.from(
    { length: 10_001 },
    (_, index) => `repo${index.toString().padStart(5, '0')}`
  )

  await assert.rejects(registryListing(registry, undefined, true), /10,000/)
  fixture.state.repositories = original
  invalidateRegistry(registry.id)
})

test('response caching saves requests and isolates connection IDs, credentials, and authentication scopes', async () => {
  const initial = fixture.requests.get(manifestPath) ?? 0

  await registryRequest(registry, manifestPath, { scope })
  await registryRequest(registry, manifestPath, { scope })
  assert.equal(fixture.requests.get(manifestPath), initial + 1)
  await registryRequest({ ...registry, id: 'other' }, manifestPath, { scope })
  await registryRequest({ ...registry, username: 'different' }, manifestPath, { scope })
  await registryRequest({ ...registry, password: encryptSecret('different') }, manifestPath, {
    scope,
  })
  await registryRequest(registry, manifestPath, { scope: 'other-scope' })
  assert.equal(fixture.requests.get(manifestPath), initial + 5)

  const hit = cachedResponse(registry, manifestPath, scope)!
  hit.headers.set('docker-content-digest', 'modified')
  assert.equal(
    cachedResponse(registry, manifestPath, scope)?.headers.get('docker-content-digest'),
    fixture.digest
  )
})

test('expiry, upstream no-store and max-age, and errors never extend cached access', async (context) => {
  invalidateRegistry(registry.id)
  const initial = fixture.requests.get(manifestPath) ?? 0
  let now = Date.now()
  context.mock.method(Date, 'now', () => now)

  await registryRequest(registry, manifestPath, { scope })
  now += 15_001
  await registryRequest(registry, manifestPath, { scope })
  assert.equal(fixture.requests.get(manifestPath), initial + 2)

  for (const control of ['no-store', 'no-cache', 'max-age=0']) {
    fixture.state.control = control
    invalidateRegistry(registry.id)
    await registryRequest(registry, manifestPath, { scope })
    assert.equal(cachedResponse(registry, manifestPath, scope), null)
  }

  fixture.state.control = ''
  await registryRequest(registry, manifestPath, { scope })
  assert.ok(cachedResponse(registry, manifestPath, scope))
  fixture.state.control = 'no-store'
  await registryRequest(registry, manifestPath, { scope, cache: 'reload' })
  assert.equal(cachedResponse(registry, manifestPath, scope), null)

  fixture.state.control = 'max-age=1'
  await registryRequest(registry, manifestPath, { scope })
  now += 1001
  assert.equal(cachedResponse(registry, manifestPath, scope), null)
  fixture.state.control = ''
  fixture.state.fail = true
  await assert.rejects(
    registryRequest(registry, manifestPath, { scope }),
    /Registry request failed/
  )
  assert.equal(cachedResponse(registry, manifestPath, scope), null)
  fixture.state.fail = false
})

test('digest cache lifetime differs from mutable tags and rejects pre-invalidation responses', (context) => {
  let now = Date.now()
  context.mock.method(Date, 'now', () => now)
  const path = `/v2/team/app/manifests/${fixture.digest}`
  const response = { text: '{}', headers: new Headers() }
  const generation = cacheGeneration()

  rememberResponse(registry, path, scope, response, generation)
  now += 20_000
  assert.ok(cachedResponse(registry, path, scope))
  now += 5 * 60_000
  assert.equal(cachedResponse(registry, path, scope), null)
  invalidateRegistry(registry.id)
  rememberResponse(registry, path, scope, response, generation)
  assert.equal(cachedResponse(registry, path, scope), null)
})

test('cache entry and byte budgets evict older data', () => {
  invalidateRegistry(registry.id)
  const generation = cacheGeneration()

  for (let index = 0; index < 205; index++) {
    rememberResponse(
      registry,
      `/v2/team/app/manifests/tag${index}`,
      scope,
      { text: '{}', headers: new Headers() },
      generation
    )
  }
  assert.equal(cachedResponse(registry, '/v2/team/app/manifests/tag0', scope), null)
  assert.ok(cachedResponse(registry, '/v2/team/app/manifests/tag204', scope))

  invalidateRegistry(registry.id)
  const body = 'x'.repeat(1024 * 1024)
  for (let index = 0; index < 33; index++) {
    rememberResponse(
      registry,
      `/v2/team/app/manifests/large${index}`,
      scope,
      { text: body, headers: new Headers() },
      cacheGeneration()
    )
  }
  assert.equal(cachedResponse(registry, '/v2/team/app/manifests/large0', scope), null)
  assert.ok(cachedResponse(registry, '/v2/team/app/manifests/large32', scope))
  invalidateRegistry(registry.id)
})

test('connection changes invalidate old credential cache entries, and image details include configured labels', async () => {
  await registryRequest(registry, manifestPath, { scope })
  const input = {
    name: registry.name,
    url: registry.url,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: false,
  }

  updateRegistry(registry.id, input)
  assert.equal(cachedResponse(registry, manifestPath, scope), null)
  const image = await imageDetails(getRegistry(registry.id), 'team/app', 'latest')
  assert.equal(
    image.labels.find((label) => label.name === 'com.example.team')?.value,
    '<script>example</script>'
  )
  assert.equal(
    image.labels.some((label) => label.name === 'com.example.hidden'),
    false
  )
})

test('saved connections can be removed after their origin or HTTP access is disabled', async () => {
  const configuration = env()
  const previousOrigins = configuration.REGISTRY_ALLOWED_ORIGINS
  const previousHttp = configuration.ALLOW_HTTP_REGISTRIES
  const input = {
    name: 'Removable connection',
    url: fixture.origin,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: false,
  }
  const id = addRegistry(input)
  const connection = getRegistry(id)

  await registryRequest(connection, manifestPath, { scope })
  assert.ok(cachedResponse(connection, manifestPath, scope))

  try {
    configuration.REGISTRY_ALLOWED_ORIGINS = ''

    assert.throws(() => getRegistry(id), /REGISTRY_ALLOWED_ORIGINS/)
    await assert.rejects(
      registryRequest(connection, manifestPath, { scope }),
      /REGISTRY_ALLOWED_ORIGINS/
    )

    removeRegistry(id)

    assert.equal(cachedResponse(connection, manifestPath, scope), null)
    assert.throws(() => getRegistry(id), /not found/)
    assert.throws(() => removeRegistry(id), /not found/)

    configuration.REGISTRY_ALLOWED_ORIGINS = previousOrigins

    const httpId = addRegistry(input)

    configuration.ALLOW_HTTP_REGISTRIES = 'false'

    assert.throws(() => getRegistry(httpId), /HTTP registries are disabled/)

    removeRegistry(httpId)

    assert.throws(() => getRegistry(httpId), /not found/)
  } finally {
    configuration.REGISTRY_ALLOWED_ORIGINS = previousOrigins
    configuration.ALLOW_HTTP_REGISTRIES = previousHttp
  }
})

test('saved connections can be repaired while replacement origins remain validated', () => {
  const configuration = env()
  const previousOrigins = configuration.REGISTRY_ALLOWED_ORIGINS
  const input = {
    name: 'Repairable connection',
    url: fixture.origin,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: false,
  }
  const id = addRegistry(input)
  const revision = getRegistry(id).revision

  try {
    configuration.REGISTRY_ALLOWED_ORIGINS = 'https://replacement.example.com'

    assert.throws(() => getRegistry(id), /REGISTRY_ALLOWED_ORIGINS/)
    assert.throws(() => updateRegistry(id, input), /REGISTRY_ALLOWED_ORIGINS/)

    updateRegistry(id, { ...input, url: 'https://replacement.example.com' })

    const connection = getRegistry(id)

    assert.equal(connection.url, 'https://replacement.example.com')
    assert.notEqual(connection.revision, revision)

    removeRegistry(id)
  } finally {
    configuration.REGISTRY_ALLOWED_ORIGINS = previousOrigins
  }
})

test('deletion invalidates mutable and digest reads, including older in-flight responses', async () => {
  fixture.state.pause = true
  const pending = registryRequest(registry, manifestPath, { scope, cache: 'reload' })

  for (let attempt = 0; !fixture.state.release && attempt < 100; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.ok(fixture.state.release)
  invalidateRegistry(registry.id)
  fixture.state.release()
  fixture.state.pause = false
  await pending
  assert.equal(cachedResponse(registry, manifestPath, scope), null)

  await registryRequest(registry, manifestPath, { scope })
  await registryRequest(registry, `/v2/team/app/manifests/${fixture.digest}`, {
    method: 'DELETE',
    scope,
  })
  assert.equal(cachedResponse(registry, manifestPath, scope), null)
  await assert.rejects(registryRequest(registry, manifestPath, { scope }), /not found/)
  removeRegistry(registry.id)
})

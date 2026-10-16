import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { mockConsole } from '../scripts/fixtures/mock-console'
import { searchRegistry } from '../src/lib/registry/search'
import { type RegistryRecord } from '../src/types/registry'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-search-'))
let fixture: Awaited<ReturnType<typeof mockConsole>>
let registry: RegistryRecord

before(async () => {
  fixture = await mockConsole()

  Object.assign(process.env, {
    APP_ORIGIN: 'https://console.example.com',
    ENCRYPTION_KEY: 'd'.repeat(64),
    DATA_DIR: directory,
    REGISTRY_ALLOWED_ORIGINS: fixture.origin,
    ALLOW_HTTP_REGISTRIES: 'true',
  })

  registry = {
    id: 'search',
    name: 'Search',
    url: fixture.origin,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: true,
  }
})

after(async () => {
  await fixture.close()
  rmSync(directory, { recursive: true, force: true })
})

test('repository searches combine name and verified architecture filters', async () => {
  assert.deepEqual(await searchRegistry(registry, { query: 'TEAM', architecture: 'amd64' }), {
    items: ['team/app'],
  })
  assert.deepEqual(await searchRegistry(registry, { query: 'missing', architecture: 'amd64' }), {
    items: [],
  })
  assert.deepEqual(await searchRegistry(registry, { architecture: 'arm64' }), { items: [] })
})

test('tag searches use tag names and reject failed image metadata instead of guessing', async (context) => {
  assert.deepEqual(
    await searchRegistry(registry, {
      repository: 'team/app',
      query: 'latest',
      architecture: 'amd64',
    }),
    { items: ['latest'] }
  )

  context.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }))

  await assert.rejects(
    searchRegistry(registry, { repository: 'team/app', architecture: 'amd64' }, true),
    /request failed/
  )
})

test('architecture inspection limits never return partial results', async (context) => {
  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))

    if (url.pathname === '/v2/_catalog') {
      return Response.json({
        repositories: Array.from({ length: 100 }, (_, index) => `team/app${index}`),
      })
    }

    if (url.pathname.includes('/tags/list')) {
      return Response.json({ tags: ['latest', 'stable', 'release'] })
    }

    return Response.json({ schemaVersion: 2, layers: [] })
  })

  await assert.rejects(
    searchRegistry({ ...registry, id: 'search-limit' }, { architecture: 'amd64' }, true),
    (error: unknown) => {
      assert.equal((error as { status: number }).status, 413)
      return true
    }
  )
})

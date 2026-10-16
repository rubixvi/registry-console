import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, test } from 'node:test'

import { mockConsole } from '../scripts/fixtures/mock-console'
import { audit, auditPage } from '../src/lib/database/audit'
import { database } from '../src/lib/database/client'
import { executeDeletion, previewDeletion } from '../src/lib/registry/delete'
import { imageDetails } from '../src/lib/registry/image'
import { addRegistry, getRegistries, getRegistry, updateRegistry } from '../src/lib/registry/store'
import { auditInput } from '../src/lib/validation/audit'
import { bulkDeleteInput, bulkPreviewInput, registryInput } from '../src/lib/validation/registry'
import { pullUrlSchema } from '../src/lib/validation/url'
import { imageHistory } from '../src/utils/image-history'
import { pullCommand } from '../src/utils/pull-command'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-console-features-'))
let fixture: Awaited<ReturnType<typeof mockConsole>>
let registryId: string

before(async () => {
  fixture = await mockConsole()

  Object.assign(process.env, {
    APP_ORIGIN: 'https://console.example.com',
    DATA_DIR: directory,
    ENCRYPTION_KEY: 'a'.repeat(64),
    REGISTRY_ALLOWED_ORIGINS: fixture.origin,
    ALLOW_HTTP_REGISTRIES: 'true',
    PULL_URL: '',
  })

  const legacy = new DatabaseSync(path.join(directory, 'console.sqlite'))

  legacy.exec(
    'CREATE TABLE registries (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL, read_only INTEGER NOT NULL DEFAULT 0)'
  )
  legacy
    .prepare("INSERT INTO registries VALUES ('legacy', 'Existing', ?, '', '', 1)")
    .run(fixture.origin)
  legacy.close()
})

after(async () => {
  database().close()
  await fixture.close()
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
})

test('registry schema migration preserves existing connections and permits public pull overrides', () => {
  const existing = getRegistries().find((registry) => registry.id === 'legacy')!

  assert.equal(existing.name, 'Existing')
  assert.equal(existing.readOnly, true)
  assert.equal(existing.pullUrl, '')
  assert.equal(existing.provider, 'distribution')
  assert.equal(existing.trivyEnabled, false)
  assert.match(getRegistry('legacy').revision!, /^[0-9a-f-]{36}$/)
  registryId = addRegistry(
    registryInput.parse({
      name: 'Production',
      url: fixture.origin,
      username: '',
      password: '',
      readOnly: false,
      pullUrl: 'https://pull.example.com/',
    })
  )
  assert.equal(getRegistry(registryId).pullUrl, 'https://pull.example.com')
  assert.equal(getRegistry(registryId).url, fixture.origin)
})

test('pull URLs reject credentials, paths, fragments, queries, and non-HTTP protocols', () => {
  for (const value of [
    'https://user:password@example.com',
    'https://example.com/path',
    'https://example.com?query=1',
    'https://example.com/#fragment',
    'javascript:alert(1)',
    'https://example.com/\ncommand',
  ]) {
    assert.equal(pullUrlSchema.safeParse(value).success, false, value)
  }
  assert.equal(pullUrlSchema.parse('http://registry:5000/'), 'http://registry:5000')
  assert.equal(
    pullCommand('http://registry:5000', 'team/app', 'latest', 'https://pull.example.com'),
    'docker pull pull.example.com/team/app:latest'
  )
  const digest = `sha256:${'a'.repeat(64)}`
  assert.equal(
    pullCommand('http://registry:5000', 'team/app', digest),
    `docker pull registry:5000/team/app@${digest}`
  )
})

test('history maps only nonempty steps to layers and keeps display order newest first', async () => {
  const details = await imageDetails(getRegistry(registryId), 'team/app', 'latest')

  assert.equal(details.history.length, 3)
  assert.equal(details.history[0].command, 'RUN build')
  assert.equal(details.history[0].size, 2048)
  assert.equal(details.history[1].emptyLayer, true)
  assert.equal(details.history[1].size, null)
  assert.equal(details.history[2].size, 1024)
  assert.deepEqual(imageHistory(null), [])
  assert.deepEqual(imageHistory({ history: 'invalid' }), [])
  assert.deepEqual(imageHistory({}), [])
})

test('audit filters escape wildcard searches and paginate without duplicates', () => {
  database().prepare('DELETE FROM audit').run()

  for (let index = 0; index < 65; index++) audit('admin', 'registry.test', `target-${index}`)

  audit('other', 'settings.update', 'literal_%_target')

  const first = auditPage(auditInput.parse({ actor: 'admin', n: 50 }))
  const second = auditPage(auditInput.parse({ actor: 'admin', n: 50, before: first.next }))

  assert.equal(first.total, 65)
  assert.equal(first.items.length, 50)
  assert.equal(second.items.length, 15)
  assert.equal(second.next, null)
  assert.equal(new Set([...first.items, ...second.items].map((entry) => entry.id)).size, 65)
  assert.equal(auditPage(auditInput.parse({ query: '_%_' })).total, 1)
  assert.equal(auditPage(auditInput.parse({ action: 'settings.update' })).items[0].actor, 'other')
  assert.equal(auditInput.safeParse({ from: '2026-10-02', to: '2026-10-01' }).success, false)
  assert.equal(auditInput.safeParse({ before: '0 OR 1=1' }).success, false)
  assert.equal(auditPage(auditInput.parse({ actor: "admin' OR 1=1 --" })).total, 0)

  database().prepare("UPDATE audit SET at = '2026-10-01T23:59:59.999Z' WHERE actor = 'other'").run()
  assert.equal(
    auditPage(auditInput.parse({ from: '2026-10-01', to: '2026-10-01', actor: 'other' })).total,
    1
  )
})

test('bulk input rejects duplicate tags, oversized batches, traversal, and invalid plans', () => {
  assert.equal(
    bulkPreviewInput.safeParse({ repository: '../private', tags: ['latest'] }).success,
    false
  )
  assert.equal(
    bulkPreviewInput.safeParse({
      repository: 'team/app',
      tags: ['latest', 'latest'],
    }).success,
    false
  )
  assert.equal(
    bulkPreviewInput.safeParse({
      repository: 'team/app',
      tags: Array.from({ length: 101 }, (_, i) => `tag-${i}`),
    }).success,
    false
  )
  assert.equal(
    bulkDeleteInput.safeParse({ planId: 'anything', confirmation: 'team/app' }).success,
    false
  )
})

test('bulk previews enforce read-only settings, isolate sessions, expire, and detect changed connections', async () => {
  const registry = getRegistry(registryId)

  await assert.rejects(
    previewDeletion({ ...registry, readOnly: true }, 'team/app', ['latest'], 'admin', 'session'),
    /read only/
  )
  const plan = await previewDeletion(registry, 'team/app', ['latest'], 'admin', 'session')
  await assert.rejects(
    executeDeletion(registry, plan.id, 'team/app', 'admin', 'other-session'),
    /unavailable/
  )
  await assert.rejects(
    executeDeletion(registry, plan.id, 'team/app', 'other-admin', 'session'),
    /unavailable/
  )
  await assert.rejects(executeDeletion(registry, plan.id, 'wrong', 'admin', 'session'), /confirm/)
  await assert.rejects(
    executeDeletion(
      { ...registry, url: 'https://other.example' },
      plan.id,
      'team/app',
      'admin',
      'session'
    ),
    /connection changed/
  )
  database().prepare('UPDATE deletion_plans SET expires = 0 WHERE id = ?').run(plan.id)
  await assert.rejects(
    executeDeletion(registry, plan.id, 'team/app', 'admin', 'session'),
    /expired/
  )
  assert.equal(fixture.deletes.size, 0)
})

test('bulk deletion deduplicates shared digests, reports partial failures, audits outcomes, and prevents replay', async () => {
  const registry = getRegistry(registryId)
  const plan = await previewDeletion(
    registry,
    'team/app',
    ['latest', 'stable', 'worker', 'protected'],
    'admin',
    'session'
  )

  assert.equal(plan.entries.length, 3)
  assert.equal(
    plan.entries.find((entry) => entry.digest === fixture.tags.get('app'))?.tags.length,
    2
  )
  assert.equal(fixture.deletes.size, 0)

  const result = await executeDeletion(registry, plan.id, 'team/app', 'admin', 'session')

  assert.equal(result.deleted, 2)
  assert.equal(result.failed, 1)
  assert.equal(fixture.deletes.get(fixture.tags.get('app')!), 1)
  assert.equal(result.results.find((entry) => !entry.success)?.tags[0], 'protected')
  await assert.rejects(
    executeDeletion(registry, plan.id, 'team/app', 'admin', 'session'),
    /unavailable/
  )
  assert.equal(auditPage(auditInput.parse({ action: 'manifest.delete' })).total, 2)
  assert.equal(auditPage(auditInput.parse({ action: 'manifest.delete.failed' })).total, 1)
  assert.equal(auditPage(auditInput.parse({ action: 'manifest.bulk.complete' })).total, 1)

  updateRegistry(registryId, {
    name: registry.name,
    url: registry.url,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: true,
  })
  await assert.rejects(
    previewDeletion(getRegistry(registryId), 'team/app', ['protected'], 'admin', 'session'),
    /read only/
  )
})

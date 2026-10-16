import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'

import { env } from '../src/lib/config/env'
import { database } from '../src/lib/database/client'
import {
  claimDiscovery,
  finishScan,
  getScan,
  pendingScan,
  releaseDiscovery,
  renewDiscovery,
  scanDelay,
} from '../src/lib/database/scan'
import { nextDiscovery, registerDiscovery } from '../src/lib/database/scan-discovery'
import { registryIdentity } from '../src/lib/registry/identity'
import { addRegistry, getRegistry, updateRegistry } from '../src/lib/registry/store'
import { prepareScan, scanStatus, scheduleScan } from '../src/lib/registry/trivy'
import { discoverRegistry, discoveryScope } from '../src/lib/registry/trivy-discovery'
import { emptyReport } from '../src/lib/registry/trivy-report'
import { scanPending } from '../src/lib/registry/trivy-worker'
import { AppError } from '../src/lib/security/error'
import { keyedFingerprint } from '../src/lib/security/fingerprint'

const HOUR = 60 * 60_000
const directory = mkdtempSync(path.join(tmpdir(), 'registry-paced-scans-'))
const executable = path.join(directory, 'scanner.cjs')
const capture = path.join(directory, 'scans.jsonl')
const runner = path.join(import.meta.dirname, 'fixtures', 'trivy-process.ts')
const original = childProcess.spawn
const objects = new Map<string, string>()
const requests: { method: string; path: string }[] = []
let clock = Date.now()
let tags = ['latest', 'alias']

function image(created: string): string {
  const config = JSON.stringify({ os: 'linux', architecture: 'amd64', created })
  const configDigest = `sha256:${createHash('sha256').update(config).digest('hex')}`
  const manifest = JSON.stringify({
    schemaVersion: 2,
    config: { digest: configDigest, size: Buffer.byteLength(config) },
    layers: [],
  })
  const digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`

  objects.set(configDigest, config)
  objects.set(digest, manifest)

  return digest
}

const first = image('2026-10-16T00:00:00Z')
const second = image('2026-10-17T00:00:00Z')
let latest = first

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  ENCRYPTION_KEY: 'd'.repeat(64),
  DATA_DIR: directory,
  REGISTRY_ALLOWED_ORIGINS: 'https://registry.example.com',
  TRIVY_ENABLED: 'true',
  TRIVY_PATH: executable,
  TRIVY_SCANS_PER_HOUR: '16',
})

writeFileSync(
  executable,
  `const fs = require('node:fs')
fs.appendFileSync(process.argv[2], JSON.stringify(process.argv.at(-1)) + '\\n')
console.log(JSON.stringify({ SchemaVersion: 2, Results: [] }))
`,
  { mode: 0o700 }
)

const input = {
  name: 'Paced scanner',
  url: 'https://registry.example.com',
  pullUrl: '',
  username: '',
  password: '',
  readOnly: true,
}
const id = addRegistry(input)
let registry = getRegistry(id)

function scanned(): string[] {
  return existsSync(capture)
    ? readFileSync(capture, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : []
}

function count(table: 'image_scans' | 'scan_queue' | 'scan_attempts'): number {
  return Number(database().prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count)
}

function child(action: 'delay' | 'status' | 'discovery'): string {
  const result = childProcess.spawnSync(
    process.execPath,
    ['--conditions=react-server', '--import', 'tsx', runner, action, String(clock), id, first],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        TRIVY_SCANS_PER_HOUR: String(env().TRIVY_SCANS_PER_HOUR),
        FORCE_COLOR: '0',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)

  return result.stdout.trim()
}

before(() => {
  mock.method(Date, 'now', () => clock)
  mock.method(
    childProcess,
    'spawn',
    (command: string, args: readonly string[], options: childProcess.SpawnOptions) =>
      command === executable
        ? original(process.execPath, [command, capture, ...args], options)
        : original(command, args, options)
  )
  syncBuiltinESMExports()
  mock.method(globalThis, 'fetch', async (raw: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(raw))
    const method = init?.method ?? 'GET'

    requests.push({ method, path: url.pathname })
    assert.equal(url.origin, registry.url)

    if (url.pathname === '/v2/_catalog') return Response.json({ repositories: ['team/app'] })
    if (url.pathname.endsWith('/tags/list')) return Response.json({ tags })

    const reference = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
    const digest = reference.startsWith('sha256:')
      ? reference
      : reference === 'latest'
        ? latest
        : first
    const text = objects.get(digest)

    assert.ok(text, reference)

    return new Response(method === 'HEAD' ? null : text, {
      headers: { 'Docker-Content-Digest': digest },
    })
  })
})

beforeEach(() => {
  clock = Date.now()
  env().TRIVY_ENABLED = 'true'
  env().TRIVY_SCANS_PER_HOUR = 16
  tags = ['latest', 'alias']
  latest = first
  requests.length = 0
  registry = getRegistry(id)
  rmSync(capture, { force: true })
})

afterEach(() => {
  database().exec(`
    DELETE FROM scan_queue;
    DELETE FROM scan_attempts;
    DELETE FROM scan_discovery;
    DELETE FROM scan_workers;
    DELETE FROM image_scans;
  `)
})

after(() => {
  mock.restoreAll()
  syncBuiltinESMExports()
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

test('background scanning discovers missing digests and reuses completed SHAs across tags and repositories', async () => {
  await scanPending()

  assert.equal(scanned().length, 1)
  assert.equal(count('scan_attempts'), 1)
  assert.equal(scanStatus(registry, 'team/app', first).status, 'complete')
  assert.equal(scanStatus(registry, 'team/mirror', first).status, 'complete')
  assert.equal(count('scan_queue'), 0)

  clock += HOUR
  await scanPending()

  assert.equal(scanned().length, 1)
  latest = second
  clock += HOUR
  await scanPending()

  assert.equal(scanned().length, 2)
  assert.equal(scanStatus(registry, 'team/app', second).status, 'complete')
})

test('rolling hourly budget spaces starts, counts failed attempts and survives a process restart', () => {
  const limit = env().TRIVY_SCANS_PER_HOUR
  const interval = Math.ceil(HOUR / limit)
  const delay = Math.ceil(interval / 1000)

  for (let index = 0; index < limit; index++) {
    const digest = image(`2026-11-${String(index + 1).padStart(2, '0')}T00:00:00Z`)
    const job = prepareScan(registry, 'team/app', digest, 'admin')

    finishScan(
      job.id,
      job.expires,
      index === 0 ? { error: 'Unavailable' } : { report: emptyReport(digest) }
    )

    assert.equal(count('scan_attempts'), index + 1)

    assert.throws(
      () => prepareScan(registry, 'team/app', second, 'admin'),
      (error: unknown) =>
        error instanceof AppError && error.status === 429 && error.retryAfter === delay
    )

    if (index < limit - 1) {
      clock += interval
    }
  }

  assert.equal(scanDelay(), delay)
  assert.equal(child('delay'), String(delay))

  clock += interval

  const job = prepareScan(registry, 'team/app', second, 'admin')

  assert.equal(count('scan_attempts'), limit)

  finishScan(job.id, job.expires, { report: emptyReport(second) })
})

test('manual and scheduled scans share the same budget and successful cache reads cost no attempts', async () => {
  const job = prepareScan(registry, 'team/app', first, 'admin')

  finishScan(job.id, job.expires, { report: emptyReport(first) })
  scheduleScan(registry, 'team/app', second)
  clock += 60_000
  await scanPending()

  assert.equal(scanned().length, 0)
  assert.equal(count('scan_attempts'), 1)
  assert.equal(scanStatus(registry, 'team/app', first).status, 'complete')
  assert.equal(count('scan_queue'), 1)

  clock += HOUR / 4
  await scanPending()

  assert.equal(scanned().length, 1)
  assert.equal(count('scan_attempts'), 2)
})

test('successful reports and pending targets persist without expiry or a 50-report cap', () => {
  const job = prepareScan(registry, 'team/app', first, 'admin')

  finishScan(job.id, job.expires, { report: emptyReport(first) })
  database().prepare('UPDATE image_scans SET expires = 1 WHERE id = ?').run(job.id)

  for (let index = 0; index < 55; index++) {
    database()
      .prepare(`
      INSERT INTO image_scans (id, registry_id, status, value, expires, updated)
      VALUES (?, ?, 'complete', ?, 1, 1)
    `)
      .run(`fixture-${index}`, id, JSON.stringify({ report: emptyReport(first) }))
  }

  scheduleScan(registry, 'team/app', second)
  assert.equal(count('image_scans'), 56)
  assert.equal(scanStatus(registry, 'team/app', first).status, 'complete')
  assert.equal(child('status').includes(second), true)
})

test('discovery checkpoints bound HEAD checks and resume pending tags after a restart', async () => {
  tags = Array.from({ length: 25 }, (_, index) => `tag-${index}`)
  const scope = discoveryScope(registry)

  registerDiscovery(registry.id, scope)
  await discoverRegistry(registry, scope, '{}', () => true)

  assert.equal(requests.filter((request) => request.method === 'HEAD').length, 10)
  assert.equal(
    requests.filter((request) => request.method === 'GET' && request.path.includes('/manifests/'))
      .length,
    0
  )
  clock += 60_000

  const cursor = nextDiscovery()!
  const saved = child('discovery')

  assert.equal(JSON.parse(saved).tags.length, 15)
  await discoverRegistry(registry, scope, cursor.value, () => true)
  assert.equal(requests.filter((request) => request.method === 'HEAD').length, 20)
  clock += 60_000
  await discoverRegistry(registry, scope, nextDiscovery()!.value, () => true)
  assert.equal(requests.filter((request) => request.method === 'HEAD').length, 25)
  assert.equal(count('scan_queue'), 1)
})

test('failed jobs retain their queue entry with increasing retry delays', () => {
  const firstJob = prepareScan(registry, 'team/app', first, 'admin')

  finishScan(firstJob.id, firstJob.expires, { error: 'Unavailable' })
  assert.equal(pendingScan(), undefined)
  assert.equal(getScan(firstJob.id)?.expires, clock + HOUR)
  clock += HOUR

  assert.equal(pendingScan()?.digest, first)
  const retry = prepareScan(registry, 'team/app', first, 'system:trivy')

  finishScan(retry.id, retry.expires, { error: 'Unavailable' })
  assert.equal(getScan(retry.id)?.expires, clock + 2 * HOUR)
})

test('disabled scanning preserves reports and queue entries and performs no discovery', async () => {
  scheduleScan(registry, 'team/app', first)
  env().TRIVY_ENABLED = 'false'

  await scanPending()

  assert.equal(requests.length, 0)
  assert.equal(count('scan_queue'), 1)
  assert.equal(count('scan_attempts'), 0)
})

test('claims roll back the budget, job and queue together when audit persistence fails', () => {
  database().exec(`CREATE TRIGGER reject_scan_audit BEFORE INSERT ON audit
    WHEN NEW.action = 'image.scan.started' BEGIN SELECT RAISE(ABORT, 'fixture'); END`)

  try {
    assert.throws(() => prepareScan(registry, 'team/app', first, 'admin'), /fixture/)
    assert.equal(count('scan_attempts'), 0)
    assert.equal(count('scan_queue'), 0)
    assert.equal(count('image_scans'), 0)
  } finally {
    database().exec('DROP TRIGGER reject_scan_audit')
  }
})

test('worker leases recover after expiry and stale owners cannot release another worker', () => {
  assert.equal(claimDiscovery('first'), true)
  assert.equal(claimDiscovery('second'), false)
  clock += 90_001
  assert.equal(claimDiscovery('second'), true)
  assert.equal(renewDiscovery('first'), false)
  releaseDiscovery('first')
  assert.equal(renewDiscovery('second'), true)
  releaseDiscovery('second')
})

test('connection changes remove queued work and old completed reports remain isolated', () => {
  const job = prepareScan(registry, 'team/app', first, 'admin')

  finishScan(job.id, job.expires, { report: emptyReport(first) })
  scheduleScan(registry, 'team/app', second)
  updateRegistry(id, { ...input, username: 'changed' })

  assert.equal(count('scan_queue'), 0)
  assert.equal(getScan(job.id)?.status, 'complete')
  assert.equal(scanStatus(getRegistry(id), 'team/app', first).status, 'not-scanned')
})

test('reports saved with the old repository key are adopted without spending the scan budget', () => {
  const previous = keyedFingerprint('trivy-report', [registryIdentity(registry), 'team/app', first])

  database()
    .prepare(`
    INSERT INTO image_scans (id, registry_id, status, value, expires, updated)
    VALUES (?, ?, 'complete', ?, 1, 1)
  `)
    .run(previous, id, JSON.stringify({ report: emptyReport(first) }))

  assert.equal(scanStatus(registry, 'team/app', first).status, 'complete')
  assert.equal(scanStatus(registry, 'team/mirror', first).status, 'complete')
  assert.equal(scheduleScan(registry, 'team/app', first), true)
  assert.equal(count('scan_attempts'), 0)
  assert.equal(count('scan_queue'), 0)
})

test('competing processes cannot claim two jobs or spend the shared budget twice', async () => {
  function compete(): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = original(
        globalThis.process.execPath,
        ['--conditions=react-server', '--import', 'tsx', runner, 'claim', String(clock), id, first],
        { env: globalThis.process.env, stdio: ['ignore', 'pipe', 'pipe'] }
      )
      let output = ''
      let errors = ''

      process.stdout.on('data', (chunk) => {
        output += chunk.toString()
      })
      process.stderr.on('data', (chunk) => {
        errors += chunk.toString()
      })
      process.once('error', reject)
      process.once('exit', (status) => {
        if (status !== 0) reject(new Error(errors))
        else resolve(output.trim())
      })
    })
  }

  assert.deepEqual((await Promise.all([compete(), compete()])).sort(), ['409', 'claimed'])
  assert.equal(count('scan_attempts'), 1)
  assert.equal(count('image_scans'), 1)
})

test('expired jobs recover and late output cannot overwrite a new execution lease', () => {
  const original = prepareScan(registry, 'team/app', first, 'admin')

  clock += HOUR

  const replacement = prepareScan(registry, 'team/app', first, 'system:trivy')

  assert.equal(finishScan(original.id, original.expires, { report: emptyReport(first) }), false)
  assert.equal(getScan(replacement.id)?.status, 'running')
  assert.equal(
    finishScan(replacement.id, replacement.expires, { report: emptyReport(first) }),
    true
  )
  assert.equal(scanStatus(registry, 'team/app', first).status, 'complete')
})

test('queued digests preserve insertion order when their timestamps match', () => {
  scheduleScan(registry, 'team/app', first)
  scheduleScan(registry, 'team/app', second)

  assert.equal(pendingScan()?.digest, first)
})

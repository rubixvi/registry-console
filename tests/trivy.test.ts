import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, mock, test } from 'node:test'

import { env } from '../src/lib/config/env'
import { database } from '../src/lib/database/client'
import { addRegistry, getRegistries, getRegistry } from '../src/lib/registry/store'
import { executeTrivy, prepareScan, runScan, scanStatus } from '../src/lib/registry/trivy'
import { appendReport, emptyReport } from '../src/lib/registry/trivy-report'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-trivy-tests-'))
const executable = path.join(directory, 'scanner.cjs')
const hanging = path.join(directory, 'hanging-scanner.cjs')
const oversized = path.join(directory, 'oversized-scanner.cjs')
const capture = path.join(directory, 'capture.json')

const fixtures = new Set([executable, hanging, oversized])
const originalSpawn = childProcess.spawn

const config = JSON.stringify({
  os: 'linux',
  architecture: 'amd64',
})

const configDigest = `sha256:${createHash('sha256').update(config).digest('hex')}`

const manifest = JSON.stringify({
  schemaVersion: 2,
  config: {
    digest: configDigest,
    size: Buffer.byteLength(config),
  },
  layers: [],
})

const digest = `sha256:${createHash('sha256').update(manifest).digest('hex')}`

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  ENCRYPTION_KEY: 'd'.repeat(64),
  DATA_DIR: directory,
  REGISTRY_ALLOWED_ORIGINS: 'https://registry.example.com,http://registry.example.com',
  ALLOW_HTTP_REGISTRIES: 'true',
  TRIVY_ENABLED: 'true',
  TRIVY_PATH: executable,
})

writeFileSync(
  executable,
  `const fs = require('node:fs')
const path = require('node:path')

const credentials = JSON.parse(
  fs.readFileSync(path.join(process.env.DOCKER_CONFIG, 'config.json'), 'utf8')
)

fs.writeFileSync(
  process.argv[2],
  JSON.stringify({
    args: process.argv.slice(3),
    env: Object.keys(process.env),
    credentials,
    temporary: process.cwd(),
    workspace: process.env.TMPDIR,
  })
)

console.log(
  JSON.stringify({
    SchemaVersion: 2,
    Results: [
      {
        Target: 'alpine',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-TEST-1',
            PkgName: 'package',
            InstalledVersion: '1',
            FixedVersion: '2',
            Severity: 'HIGH',
          },
        ],
      },
    ],
  })
)
`,
  { mode: 0o700 }
)

const id = addRegistry({
  name: 'Scanner',
  url: 'https://registry.example.com',
  pullUrl: '',
  username: 'reader',
  password: 'private-password',
  readOnly: true,
})

const registry = getRegistry(id)

before(() => {
  mock.method(
    childProcess,
    'spawn',
    (command: string, args: readonly string[], options: childProcess.SpawnOptions) => {
      if (fixtures.has(command)) {
        return originalSpawn(process.execPath, [command, capture, ...args], options)
      }

      return originalSpawn(command, args, options)
    }
  )

  syncBuiltinESMExports()
})

afterEach(() => {
  database().prepare('DELETE FROM scan_attempts').run()
})

after(() => {
  mock.restoreAll()
  syncBuiltinESMExports()

  database().close()
  rmSync(directory, { recursive: true, force: true })
})

test('Trivy subprocess uses immutable references, scoped credentials, minimal environment, and removes temporary secrets', async () => {
  const output = await executeTrivy(registry, 'team/app', digest, 'linux/amd64', 5000)
  const saved = JSON.parse(readFileSync(capture, 'utf8'))

  assert.equal((output as { SchemaVersion: number }).SchemaVersion, 2)
  assert.equal(saved.args.at(-1), `registry.example.com/team/app@${digest}`)
  assert.ok(saved.args.includes('--image-src'))
  assert.equal(saved.args.includes('--insecure'), false)
  assert.ok(!saved.args.some((argument: string) => argument.includes('private-password')))

  assert.equal(saved.env.includes('ENCRYPTION_KEY'), false)
  assert.equal(saved.env.includes('AUTH_PASSWORD_HASH'), false)

  assert.deepEqual(Object.keys(saved.credentials.auths), ['registry.example.com'])
  assert.equal(
    Buffer.from(saved.credentials.auths['registry.example.com'].auth, 'base64').toString(),
    'reader:private-password'
  )

  assert.equal(existsSync(saved.temporary), false)
  assert.equal(path.dirname(saved.workspace), path.join(directory, 'trivy-tmp'))
  assert.equal(existsSync(saved.workspace), false)
})

test('Trivy reports retain per-platform totals and mark bounded detail output', () => {
  const report = emptyReport(digest)
  const raw = {
    SchemaVersion: 2,
    Results: [
      {
        Target: 'system',
        Vulnerabilities: Array.from({ length: 1001 }, () => ({
          VulnerabilityID: 'CVE-TEST',
          PkgName: 'pkg',
          InstalledVersion: '1',
          Severity: 'CRITICAL',
        })),
      },
    ],
  }

  appendReport(report, raw, 'linux/arm64')

  assert.equal(report.counts.CRITICAL, 1001)
  assert.equal(report.vulnerabilities.length, 1000)
  assert.equal(report.truncated, true)
  assert.deepEqual(report.platforms, ['linux/arm64'])

  assert.throws(() => appendReport(report, { SchemaVersion: 1 }, 'linux/amd64'))
})

test('scan jobs enforce global opt-in, concurrency, immutable digests, and credential isolation', async (context) => {
  const configuration = env()
  const previous = configuration.TRIVY_ENABLED

  assert.equal(getRegistry(id).trivyEnabled, true)
  assert.equal(getRegistries().find((entry) => entry.id === id)?.trivyEnabled, true)
  assert.equal(scanStatus(registry, 'team/app', digest).enabled, true)

  configuration.TRIVY_ENABLED = 'false'

  try {
    assert.equal(getRegistry(id).trivyEnabled, false)
    assert.equal(getRegistries().find((entry) => entry.id === id)?.trivyEnabled, false)
    assert.equal(scanStatus(registry, 'team/app', digest).enabled, false)

    assert.throws(() => prepareScan(registry, 'team/app', digest, 'admin'), /disabled/)
  } finally {
    configuration.TRIVY_ENABLED = previous
  }

  assert.throws(() => prepareScan(registry, 'team/app', 'latest', 'admin'))

  const job = prepareScan(registry, 'team/app', digest, 'admin')

  assert.equal(scanStatus(registry, 'team/app', digest).status, 'running')
  const repeated = prepareScan(registry, 'team/app', digest, 'admin')

  assert.equal(repeated.started, false)
  assert.equal(repeated.expires, job.expires)

  assert.equal(
    scanStatus({ ...registry, username: 'other-reader' }, 'team/app', digest).status,
    'not-scanned'
  )

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))

    return new Response(url.pathname.includes('/blobs/') ? config : manifest)
  })

  await runScan(job)

  const result = scanStatus(registry, 'team/app', digest)

  assert.equal(result.status, 'complete')
  assert.equal(result.report?.counts.HIGH, 1)
  assert.equal(result.report?.digest, digest)

  assert.equal(
    database().prepare("SELECT id FROM audit WHERE action = 'image.scan.complete'").all().length,
    1
  )
})

test('HTTP scans use the internal registry origin and keep public pull overrides out of scanner access', async (context) => {
  const httpId = addRegistry({
    name: 'Internal scanner',
    url: 'http://registry.example.com',
    pullUrl: 'https://pull.example.com',
    username: 'reader',
    password: 'private-password',
    readOnly: true,
  })
  const connection = getRegistry(httpId)
  const job = prepareScan(connection, 'team/app', digest, 'admin')

  context.mock.method(globalThis, 'fetch', async (raw: string | URL | Request) => {
    const url = new URL(String(raw))

    assert.equal(url.origin, connection.url)

    return new Response(url.pathname.includes('/blobs/') ? config : manifest)
  })

  await runScan(job)

  const result = scanStatus(connection, 'team/app', digest)
  const saved = JSON.parse(readFileSync(capture, 'utf8'))

  assert.equal(result.status, 'complete')
  assert.equal(result.report?.counts.HIGH, 1)
  assert.equal(saved.args.at(-1), `registry.example.com/team/app@${digest}`)
  assert.equal(saved.args.includes('--insecure'), true)
  assert.deepEqual(Object.keys(saved.credentials.auths), ['registry.example.com'])
  assert.equal(existsSync(saved.temporary), false)
  assert.equal(existsSync(saved.workspace), false)
})

test('HTTP scans still require the registry allowlist and explicit HTTP opt-in', async () => {
  const configuration = env()
  const previousOrigins = configuration.REGISTRY_ALLOWED_ORIGINS
  const previousHttp = configuration.ALLOW_HTTP_REGISTRIES
  const connection = { ...registry, url: 'http://registry.example.com' }

  try {
    configuration.ALLOW_HTTP_REGISTRIES = 'false'

    assert.throws(
      () => prepareScan(connection, 'team/app', digest, 'admin'),
      /HTTP registries are disabled/
    )
    await assert.rejects(
      executeTrivy(connection, 'team/app', digest, 'linux/amd64', 5000),
      /HTTP registries are disabled/
    )

    configuration.ALLOW_HTTP_REGISTRIES = 'true'
    configuration.REGISTRY_ALLOWED_ORIGINS = 'https://registry.example.com'

    assert.throws(
      () => prepareScan(connection, 'team/app', digest, 'admin'),
      /REGISTRY_ALLOWED_ORIGINS/
    )
    await assert.rejects(
      executeTrivy(connection, 'team/app', digest, 'linux/amd64', 5000),
      /REGISTRY_ALLOWED_ORIGINS/
    )
  } finally {
    configuration.REGISTRY_ALLOWED_ORIGINS = previousOrigins
    configuration.ALLOW_HTTP_REGISTRIES = previousHttp
  }
})

test('scanner failures are bounded and configuration changes fail a prepared job', async () => {
  const previous = env().TRIVY_PATH

  try {
    env().TRIVY_PATH = path.join(directory, 'missing-executable')

    await assert.rejects(
      executeTrivy(registry, 'team/app', digest, 'linux/amd64', 1000),
      /could not be started/
    )
  } finally {
    env().TRIVY_PATH = previous
  }

  const job = prepareScan(registry, 'team/app', `sha256:${'f'.repeat(64)}`, 'admin')

  database()
    .prepare('UPDATE registries SET username = ?, revision = ? WHERE id = ?')
    .run('changed', 'new-revision', id)

  await runScan(job)

  const row = database()
    .prepare('SELECT status, value FROM image_scans WHERE id = ?')
    .get(job.id) as {
    status: string
    value: string
  }

  assert.equal(row.status, 'failed')
  assert.match(row.value, /connection changed/)
})

test('scanner deadlines and output budgets terminate the process and remove credentials', async () => {
  const previous = env().TRIVY_PATH

  writeFileSync(hanging, `setInterval(() => undefined, 1000)\n`, {
    mode: 0o700,
  })

  writeFileSync(oversized, `process.stdout.write('x'.repeat(17 * 1024 * 1024))\n`, { mode: 0o700 })

  try {
    env().TRIVY_PATH = hanging

    await assert.rejects(
      executeTrivy(registry, 'team/app', digest, 'linux/amd64', 100),
      /timed out/
    )

    env().TRIVY_PATH = oversized

    await assert.rejects(
      executeTrivy(registry, 'team/app', digest, 'linux/amd64', 5000),
      /report size/
    )
  } finally {
    env().TRIVY_PATH = previous
  }
})

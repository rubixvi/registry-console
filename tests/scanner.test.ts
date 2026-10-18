import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  chmodSync,
  chownSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

test('the scanner authenticates requests, limits capacity and strips console secrets', async (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'registry scanner '))
  const root = process.getuid?.() === 0
  let isolated = root
  const privateFile = path.join(directory, 'console', 'console.sqlite')
  const cache = path.join(directory, 'scanner')
  const executable = path.join(directory, 'trivy.mjs')
  const token = 'a'.repeat(64)

  chmodSync(directory, 0o755)
  mkdirSync(path.dirname(privateFile), { mode: 0o700 })
  writeFileSync(privateFile, 'private-console-state', { mode: 0o600 })
  mkdirSync(cache, { mode: 0o700 })

  if (root) {
    try {
      chownSync(cache, 1001, 1001)
      chownSync(path.dirname(privateFile), 1000, 1000)
      chownSync(privateFile, 1000, 1000)
    } catch (error) {
      if (!['EINVAL', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      isolated = false
    }
  }

  writeFileSync(
    executable,
    `import { readFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const target = args.at(-1)
const credentials = JSON.parse(readFileSync(path.join(process.env.DOCKER_CONFIG, 'config.json'), 'utf8'))
let denied = false

try { readFileSync(${JSON.stringify(privateFile)}) } catch (error) { denied = error.code === 'EACCES' }

if (target.includes('/slow@')) await new Promise((resolve) => setTimeout(resolve, 10000))

console.log(JSON.stringify({
  uid: process.getuid?.() ?? null, denied, args, credentials,
  leaked: process.env.ENCRYPTION_KEY || process.env.AUTH_PASSWORD_HASH || process.env.TRIVY_RUNNER_TOKEN,
  workspace: process.cwd(),
}))
`,
    { mode: 0o755 }
  )

  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      assert.ok(address && typeof address !== 'string')
      server.close(() => resolve(address.port))
    })
  })
  const worker = spawn(process.execPath, ['tests/fixtures/scanner-process.mjs'], {
    ...(isolated ? { uid: 1001, gid: 1001 } : {}),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      SCANNER_DIR: cache,
      SCANNER_HOST: '127.0.0.1',
      SCANNER_PORT: String(port),
      TRIVY_PATH: executable,
      TRIVY_RUNNER_TOKEN: token,
      REGISTRY_ALLOWED_ORIGINS: 'https://registry.example.com',
      ENCRYPTION_KEY: 'must-not-reach-trivy',
      AUTH_PASSWORD_HASH: 'must-not-reach-trivy',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let logs = ''

  worker.stderr.on('data', (chunk) => {
    logs += chunk.toString()
  })
  context.after(async () => {
    if (worker.exitCode === null && worker.signalCode === null) {
      await new Promise<void>((resolve) => {
        worker.once('exit', () => resolve())
        worker.kill('SIGTERM')
      })
    }

    rmSync(directory, { recursive: true, force: true })
  })

  const origin = `http://127.0.0.1:${port}`
  let ready = false

  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(worker.exitCode, null, logs)

    try {
      const response = await fetch(`${origin}/health`)

      await response.body?.cancel()
      if (response.ok) {
        ready = true
        break
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  assert.ok(ready, logs)
  const input = {
    origin: 'https://registry.example.com',
    repository: 'team/image',
    digest: `sha256:${'1'.repeat(64)}`,
    platform: 'linux/amd64',
    provider: 'distribution',
    username: 'robot',
    password: 'registry-password',
    timeout: 5000,
  }
  const request = (value = input, auth = token) =>
    fetch(`${origin}/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    })

  assert.equal((await request(input, 'invalid')).status, 401)
  assert.equal((await request({ ...input, origin: 'https://unapproved.example.com' })).status, 400)
  const response = await request()
  const report = await response.json()

  assert.equal(response.status, 200, logs)
  assert.equal(report.leaked, undefined)
  assert.equal(
    report.credentials.auths['registry.example.com'].auth,
    Buffer.from('robot:registry-password').toString('base64')
  )
  assert.ok(report.args.includes('remote'))
  assert.equal(report.args.at(-1), `registry.example.com/team/image@${input.digest}`)
  assert.ok(!report.args.includes('registry-password'))
  await context.test(
    'the scanner UID cannot read the console database',
    {
      skip: !isolated && 'Requires root with mappings for UIDs 1000 and 1001.',
    },
    () => {
      assert.equal(report.uid, 1001)
      assert.equal(report.denied, true)
    }
  )

  const slow = request({ ...input, repository: 'slow', timeout: 500 })

  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal((await request()).status, 503)
  assert.equal((await slow).status, 502)
  assert.equal((await request()).status, 200)
  assert.deepEqual(readdirSync(cache), ['cache'])
})

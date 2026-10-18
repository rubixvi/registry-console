import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'

import { hashPassword } from './helpers/crypto.mjs'
import { availablePort } from './helpers/network.mjs'
import { docker, imageArgument } from './helpers/process.mjs'

const image = imageArgument('test:container')
const name = `registry-console-test-${randomBytes(6).toString('hex')}`
const volume = `${name}-data`
const port = await availablePort()
const base = `http://127.0.0.1:${port}`
const password = randomBytes(24).toString('base64url')

const containerEnv = {
  NODE_ENV: 'production',
  APP_ORIGIN: base,
  AUTH_USERNAME: 'smoke-admin',
  AUTH_PASSWORD_HASH: hashPassword(password),
  ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  AUTH_USERS_JSON: '',
  REGISTRY_URL: '',
  REGISTRY_ALLOWED_ORIGINS: '',
  REGISTRY_TOKEN_ORIGINS: '',
  ALLOW_HTTP_REGISTRIES: 'false',
  TRUST_PROXY: 'false',
  TRIVY_ENABLED: 'false',
  DATA_DIR: '/app/data',
  NEXT_TELEMETRY_DISABLED: '1',
}

await test('Container smoke', { concurrency: false }, async (t) => {
  let volumeCreated = false

  t.after(() => {
    spawnSync('docker', ['rm', '--force', name], {
      stdio: 'ignore',
      timeout: 30_000,
    })

    if (volumeCreated) {
      spawnSync('docker', ['volume', 'rm', volume], {
        stdio: 'ignore',
        timeout: 30_000,
      })
    }
  })

  docker(['volume', 'create', volume])
  volumeCreated = true
  startContainer()
  await waitForContainer()

  await t.test('APIs reject anonymous access', async () => {
    const response = await request('/api/registries')

    assert.equal(response.status, 401)
    await response.body?.cancel()
  })

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-admin', password }),
  })

  assert.equal(login.status, 200, 'administrator can sign in')
  await login.body?.cancel()

  const setCookie = login.headers.get('set-cookie') ?? ''
  const cookie = setCookie.split(';')[0]

  await t.test('loopback session cookies retain security attributes', () => {
    assert.match(setCookie, /^registry_session=/)
    assert.match(setCookie, /(?:^|;)\s*HttpOnly(?:;|$)/i)
    assert.match(setCookie, /(?:^|;)\s*SameSite=strict(?:;|$)/i)
    assert.doesNotMatch(setCookie, /(?:^|;)\s*Secure(?:;|$)/i)
  })

  await t.test('authenticated users can read the empty registry list', async () => {
    const response = await request('/api/registries', {
      headers: { Cookie: cookie },
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), [])
  })

  await t.test('source archives are not publicly accessible', async () => {
    const response = await request('/source.tar.gz')

    assert.equal(response.status, 404)
    await response.body?.cancel()
  })

  await t.test('runtime is unprivileged and supports the mounted data directory', checkRuntime)

  await t.test('the scanner UID cannot read the console database', () => {
    const script = [
      "const fs = require('node:fs')",
      'if (process.getuid() !== 1001) process.exit(1)',
      "try { fs.readFileSync('/app/data/console.sqlite'); process.exit(1) } catch (error) { if (error.code !== 'EACCES') throw error }",
    ].join(';\n')

    docker(['exec', '--user', '1001:1001', name, 'node', '-e', script])
  })

  await t.test('Trivy is installed in the container', () => {
    const version = docker(['exec', name, '/usr/local/bin/trivy', '--version'])

    assert.match(version, /^Version: \d+\.\d+\.\d+/m)
  })

  await t.test('logged-out session cookies cannot be replayed', async () => {
    const logout = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        Origin: base,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })

    assert.equal(logout.status, 200)
    await logout.body?.cancel()

    const replay = await request('/api/registries', {
      headers: { Cookie: cookie },
    })

    assert.equal(replay.status, 401)
    await replay.body?.cancel()
  })
})

async function request(path, options = {}) {
  return fetch(`${base}${path}`, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  })
}

function startContainer() {
  const args = [
    'run',
    '--detach',
    '--name',
    name,
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--mount',
    `type=volume,src=${volume},dst=/app/data`,
    '--publish',
    `127.0.0.1:${port}:3000`,
  ]

  for (const key of Object.keys(containerEnv)) {
    args.push('--env', key)
  }

  args.push(image)
  docker(args, { env: { ...process.env, ...containerEnv } })
}

async function waitForContainer() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await request('/api/health')
      const ready = response.ok

      await response.body?.cancel()

      if (ready) return
    } catch {
      // The container may not be listening yet.
    }

    const running = docker(['inspect', '--format', '{{.State.Running}}', name])

    if (running !== 'true') {
      throw new Error(`Container exited\n${docker(['logs', name])}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Container startup timed out\n${docker(['logs', name])}`)
}

function checkRuntime() {
  const paths = [
    '/usr/local/lib/node_modules/npm',
    '/usr/local/lib/node_modules/corepack',
    '/usr/local/bin/npm',
    '/usr/local/bin/npx',
    '/usr/local/bin/corepack',
    '/usr/local/bin/pnpm',
    '/usr/local/bin/pnpx',
    '/usr/local/bin/yarn',
    '/usr/local/bin/yarnpkg',
  ]
  const script = [
    "const fs = require('node:fs')",
    `const paths = ${JSON.stringify(paths)}`,
    "if (process.getuid() === 0) throw new Error('Container runs as root')",
    "if (fs.existsSync('/app/.env')) throw new Error('Image contains .env')",
    "if (fs.existsSync('/app/public/source.tar.gz')) throw new Error('Image contains source archive')",
    "if (paths.some(file => fs.lstatSync(file, { throwIfNoEntry: false }))) throw new Error('Runtime contains a package manager')",
    "if (fs.readdirSync('/opt').some(name => name.startsWith('yarn-v'))) throw new Error('Runtime contains Yarn')",
    "const probe = '/app/data/.smoke-write-test'",
    "fs.writeFileSync(probe, 'ok')",
    'fs.unlinkSync(probe)',
  ].join(';\n')

  docker(['exec', name, 'node', '-e', script])
}

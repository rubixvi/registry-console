import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

import { hashPassword } from './helpers/crypto.mjs'
import { availablePort } from './helpers/network.mjs'
import { docker, imageArgument } from './helpers/process.mjs'

const image = imageArgument('test:container')

const name = `registry-console-test-${randomBytes(6).toString('hex')}`
const volume = `${name}-data`
const port = await availablePort()
const base = `http://127.0.0.1:${port}`
const password = randomBytes(24).toString('base64url')
const hash = hashPassword(password)

const containerEnv = {
  NODE_ENV: 'production',
  APP_ORIGIN: base,
  AUTH_USERNAME: 'smoke-admin',
  AUTH_PASSWORD_HASH: hash,
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

async function request(path, options = {}) {
  return fetch(`${base}${path}`, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  })
}

let volumeCreated = false

try {
  docker(['volume', 'create', volume])
  volumeCreated = true

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

  docker(args, {
    env: {
      ...process.env,
      ...containerEnv,
    },
  })

  let ready = false

  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await request('/api/health')

      ready = response.ok
      await response.body?.cancel()
    } catch {
      // Wait for the server.
    }

    if (ready) break

    const running = docker(['inspect', '--format', '{{.State.Running}}', name])

    if (running !== 'true') {
      throw new Error(`Container exited\n${docker(['logs', name])}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  if (!ready) {
    throw new Error(`Container startup timed out\n${docker(['logs', name])}`)
  }

  const anonymous = await request('/api/registries')
  assert.equal(anonymous.status, 401)
  await anonymous.body?.cancel()

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      Origin: base,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'smoke-admin',
      password,
    }),
  })

  assert.equal(login.status, 200)
  await login.body?.cancel()

  const setCookie = login.headers.get('set-cookie') || ''

  assert.match(setCookie, /^registry_session=/)
  assert.match(setCookie, /(?:^|;)\s*HttpOnly(?:;|$)/i)
  assert.match(setCookie, /(?:^|;)\s*SameSite=strict(?:;|$)/i)
  assert.doesNotMatch(setCookie, /(?:^|;)\s*Secure(?:;|$)/i)

  const cookie = setCookie.split(';')[0]

  const authenticated = await request('/api/registries', {
    headers: { Cookie: cookie },
  })

  assert.equal(authenticated.status, 200)
  assert.deepEqual(await authenticated.json(), [])

  const archive = await request('/source.tar.gz')
  assert.equal(archive.status, 404)
  await archive.body?.cancel()

  const runtimeCheck = [
    "const fs = require('node:fs')",
    "if (process.getuid() === 0) throw new Error('Container runs as root')",
    "if (fs.existsSync('/app/.env')) throw new Error('Image contains .env')",
    "if (fs.existsSync('/app/public/source.tar.gz')) throw new Error('Image contains source archive')",
    "const probe = '/app/data/.smoke-write-test'",
    "fs.writeFileSync(probe, 'ok')",
    'fs.unlinkSync(probe)',
  ].join(';\n')

  docker(['exec', name, 'node', '-e', runtimeCheck])

  const scannerVersion = docker(['exec', name, '/usr/local/bin/trivy', '--version'])

  assert.match(scannerVersion, /^Version: \d+\.\d+\.\d+/m)

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

  console.log('Container checks passed.')
} finally {
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
}

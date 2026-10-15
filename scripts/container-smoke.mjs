import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { createServer } from 'node:net'

const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}

const image = process.argv[2]

if (!image || image.startsWith('-') || /\s/.test(image)) {
  throw new Error('Usage: pnpm run test:container -- registry/owner/image:tag')
}

const name = `registry-console-test-${randomBytes(6).toString('hex')}`
const volume = `${name}-data`
const portServer = createServer()

await new Promise((resolve, reject) => {
  portServer.once('error', reject)
  portServer.listen(0, '127.0.0.1', resolve)
})

const address = portServer.address()

if (!address || typeof address === 'string') {
  throw new Error('Port unavailable.')
}

const port = address.port

await new Promise((resolve, reject) => {
  portServer.close((error) => {
    if (error) {
      reject(error)
      return
    }

    resolve()
  })
})

const base = `http://127.0.0.1:${port}`
const password = randomBytes(24).toString('base64url')
const salt = randomBytes(16)
const passwordHash = scryptSync(password, salt, 32, SCRYPT_OPTIONS)

const hash = ['scrypt', '32768', '8', '1', salt.toString('hex'), passwordHash.toString('hex')].join(
  '$'
)

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
  DATA_DIR: '/app/data',
  NEXT_TELEMETRY_DISABLED: '1',
}

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 60_000,
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const message = result.stderr || result.stdout || result.signal
    throw new Error(`Docker command failed: ${message}`)
  }

  return result.stdout.trim()
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

  console.log(
    'Container smoke test passed with a non-root user, read-only root filesystem, writable named volume, and authenticated production server.'
  )
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

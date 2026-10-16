import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { checkAuthentication } from './fixtures/authentication'
import { checkBrowsing } from './fixtures/browsing'
import { checkConsole } from './fixtures/console'
import { mockBrowsing } from './fixtures/mock-browsing'
import { mockConsole } from './fixtures/mock-console'
import { mockRegistry } from './fixtures/mock-registry'
import { encryptSecret, hashPassword } from './helpers/crypto.mjs'
import { availablePort } from './helpers/network.mjs'
import { createCheck, createRequest } from './helpers/testing'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-integration-'))
const fixture = await mockRegistry()
const consoleFixture = await mockConsole()
const browsingFixture = await mockBrowsing()
const port = await availablePort()

const loopbackHttp = process.env.INTEGRATION_HTTP === 'true'
const origin = loopbackHttp ? `http://127.0.0.1:${port}` : `https://localhost:${port}`

const base = `http://127.0.0.1:${port}`
const password = 'a-long-test-password'
const hash = hashPassword(password)
const key = randomBytes(32)
const encryptedPassword = encryptSecret('registry-secret', key)

const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      APP_ORIGIN: origin,
      DATA_DIR: directory,
      ENCRYPTION_KEY: key.toString('hex'),
      AUTH_USERS_JSON: JSON.stringify([
        { username: 'admin', passwordHash: hash, role: 'admin' },
        { username: 'reader', passwordHash: hash, role: 'viewer' },
      ]),
      TRUST_PROXY: 'false',
      REGISTRY_ALLOWED_ORIGINS: `${fixture.origin},${consoleFixture.origin},${browsingFixture.origin}`,
      PULL_URL: 'https://pull-default.example.com',
      TAGLIST_ORDER: 'natural-asc',
      HISTORY_CUSTOM_LABELS: 'com.example.team',
      REGISTRY_TOKEN_ORIGINS: '',
      ALLOW_HTTP_REGISTRIES: 'true',
      REGISTRY_URL: fixture.origin,
      REGISTRY_NAME: 'Production',
      REGISTRY_USERNAME: 'robot',
      REGISTRY_PASSWORD_ENCRYPTED: encryptedPassword,
      REGISTRY_READ_ONLY: 'false',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
)

let logs = ''
let spawnError: Error | undefined
let assertions = 0

child.stdout.on('data', (chunk) => {
  logs += chunk.toString()
})

child.stderr.on('data', (chunk) => {
  logs += chunk.toString()
})

child.once('error', (error) => {
  spawnError = error
})

const check = createCheck()
const request = createRequest({ base, origin })

try {
  let ready = false

  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) {
      throw spawnError
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server exited during startup\n${logs}`)
    }

    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      })

      ready = response.ok
      await response.body?.cancel()
    } catch {
      // Server is still starting.
    }

    if (ready) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  if (!ready) {
    throw new Error(`Startup timed out\n${logs}`)
  }

  check((await request('/api/registries')).status === 401, 'unauthenticated APIs reject access')

  check((await request('/')).status === 307, 'protected page redirects to login')

  const crossOriginLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password },
    origin: 'https://evil.example',
  })

  check(crossOriginLogin.status === 403, 'login rejects cross-origin requests')

  const incorrectLogin = await request('/api/auth/login', {
    method: 'POST',
    body: {
      username: 'admin',
      password: 'wrong',
    },
  })

  check(incorrectLogin.status === 401, 'login rejects incorrect passwords')

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: {
      username: 'admin',
      password,
    },
  })

  check(login.status === 200, 'admin login succeeds')

  const setCookie = login.headers.get('set-cookie') || ''
  const expectedCookieName = loopbackHttp ? 'registry_session=' : '__Host-registry_session='

  const hasSecureFlag = /(?:^|;)\s*Secure(?:;|$)/i.test(setCookie)

  check(
    setCookie.includes(expectedCookieName) &&
      setCookie.includes('HttpOnly') &&
      hasSecureFlag === !loopbackHttp &&
      /(?:^|;)\s*SameSite=strict(?:;|$)/i.test(setCookie),
    'session cookie matches the origin and retains security attributes'
  )

  const cookie = setCookie.split(';')[0]
  const connectionsResponse = await request('/api/registries', { cookie })

  check(connectionsResponse.status === 200, 'authenticated user can list connections')

  const connections = await connectionsResponse.json()
  const serializedConnections = JSON.stringify(connections)

  check(
    connections.length === 1 &&
      !serializedConnections.includes('registry-secret') &&
      !serializedConnections.includes(encryptedPassword),
    'initial connection is seeded without exposing credentials'
  )

  const id = connections[0].id
  const registryApi = `/api/registries/${encodeURIComponent(id)}`

  check(
    (await request(`${registryApi}/status`, { cookie })).status === 200,
    'Bearer authentication connects to registry'
  )

  const catalogue = await (await request(`${registryApi}/catalog`, { cookie })).json()

  check(
    catalogue.items[0] === 'team/api' && catalogue.next === 'team/api',
    'catalogue pagination works'
  )

  const catalogueTokenCount = fixture.state.tokens.filter(
    (token) => token.scope === 'registry:catalog:*'
  ).length

  const secondPage = await (
    await request(`${registryApi}/catalog?last=team%2Fapi`, { cookie })
  ).json()

  check(secondPage.items[0] === 'worker' && !secondPage.next, 'next catalogue page works')

  check(
    fixture.state.tokens.filter((token) => token.scope === 'registry:catalog:*').length ===
      catalogueTokenCount,
    'catalogue pagination reuses a scoped Bearer token'
  )

  const tags = await (await request(`${registryApi}/tags?repository=team%2Fapi`, { cookie })).json()

  check(tags.items.includes('latest'), 'tag list works')

  const image = await (
    await request(`${registryApi}/image?repository=team%2Fapi&reference=latest`, { cookie })
  ).json()

  check(
    image.verified === true &&
      image.digest === fixture.digest &&
      image.config.architecture === 'amd64',
    'manifest and config digests are verified'
  )

  const index = await (
    await request(`${registryApi}/image?repository=team%2Fapi&reference=multi`, { cookie })
  ).json()

  check(index.platforms[0] === 'linux/amd64', 'multi-platform OCI index works')

  check(
    (await request(`${registryApi}/image?repository=bad&reference=latest`, { cookie })).status ===
      502,
    'tampered manifest is rejected'
  )

  check(
    (await request(`${registryApi}/image?repository=redirect&reference=latest`, { cookie }))
      .status === 502,
    'upstream redirects are blocked'
  )

  fixture.state.mode = 'evil-token'

  try {
    check(
      (await request(`${registryApi}/status`, { cookie })).status === 502,
      'unapproved token realm is blocked'
    )
  } finally {
    fixture.state.mode = 'normal'
  }

  check(
    fixture.state.tokens.every((token) => !token.scope.includes('evil')),
    'challenge cannot escalate the requested token scope'
  )

  const readerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: {
      username: 'reader',
      password,
    },
  })

  check(readerLogin.status === 200, 'viewer login succeeds')

  const readerCookie = (readerLogin.headers.get('set-cookie') || '').split(';')[0]

  check(
    (await request(`${registryApi}/catalog`, { cookie: readerCookie })).status === 200,
    'viewer can browse registry'
  )

  const deletion = {
    repository: 'team/api',
    digest: image.digest,
    confirmation: 'team/api',
  }

  check(
    (
      await request(`${registryApi}/image`, {
        method: 'DELETE',
        body: deletion,
        cookie: readerCookie,
      })
    ).status === 403,
    'viewer cannot delete images'
  )

  check(
    (await request('/api/settings', { method: 'PUT', body: {}, cookie: readerCookie })).status ===
      403,
    'viewer cannot change settings'
  )

  check(
    (
      await request(`${registryApi}/image`, {
        method: 'DELETE',
        body: deletion,
        cookie,
        origin: 'https://evil.example',
      })
    ).status === 403,
    'deletion is protected against CSRF'
  )

  check(
    (
      await request(`${registryApi}/image`, {
        method: 'DELETE',
        body: {
          ...deletion,
          confirmation: 'wrong',
        },
        cookie,
      })
    ).status === 400,
    'deletion requires correct typed confirmation'
  )

  const update = {
    name: 'Production',
    url: fixture.origin,
    username: 'robot',
    password: 'registry-secret',
    readOnly: true,
  }

  check(
    (await request(registryApi, { method: 'PUT', body: update, cookie })).status === 200,
    'connection can be updated'
  )

  check(
    (await request(`${registryApi}/image`, { method: 'DELETE', body: deletion, cookie })).status ===
      403,
    'read-only connection blocks administrator deletion'
  )

  check(
    (
      await request(registryApi, {
        method: 'PUT',
        body: {
          ...update,
          readOnly: false,
        },
        cookie,
      })
    ).status === 200,
    'connection can be made writable'
  )

  check(
    (
      await request('/api/registries', {
        method: 'POST',
        body: {
          ...update,
          url: 'https://evil.example',
        },
        cookie,
      })
    ).status === 400,
    'adding an unapproved origin is rejected'
  )

  const settings = {
    name: 'Acme Registry',
    footer: 'Private image library',
    accent: '#7c3aed',
    logoPath: '',
  }

  check(
    (await request('/api/settings', { method: 'PUT', body: settings, cookie })).status === 200,
    'settings can be saved'
  )

  const savedSettings = await (await request('/api/settings', { cookie })).json()

  check(
    savedSettings.name === settings.name &&
      savedSettings.footer === settings.footer &&
      savedSettings.accent === settings.accent &&
      savedSettings.logoPath === settings.logoPath,
    'settings persist in SQLite'
  )

  const html = await (await request('/', { cookie })).text()

  check(html.includes(settings.name), 'saved branding renders on the server')

  check(
    !html.includes('registry-secret') && !html.includes(encryptedPassword) && !html.includes(hash),
    'server-rendered HTML does not expose secrets'
  )

  const loginPage = await request('/login')
  const csp = loginPage.headers.get('content-security-policy') || ''

  check(
    csp.includes("'nonce-") && !csp.includes("script-src 'unsafe-inline'"),
    'nonce CSP is applied'
  )

  await loginPage.body?.cancel()

  const databaseFiles = [
    path.join(directory, 'console.sqlite'),
    path.join(directory, 'console.sqlite-wal'),
  ]

  for (const filename of databaseFiles) {
    if (!existsSync(filename)) {
      continue
    }

    const bytes = readFileSync(filename)

    check(
      !bytes.includes(Buffer.from('registry-secret')),
      `${path.basename(filename)} does not contain the plaintext registry password`
    )
  }

  assertions += await checkBrowsing({
    base,
    origin,
    cookie,
    readerCookie,
    fixture: browsingFixture,
  })

  assertions += await checkConsole({ base, origin, cookie, readerCookie, fixture: consoleFixture })

  if (process.env.KEEP_INTEGRATION === '1') {
    console.log(
      JSON.stringify({
        base,
        origin,
        cookie,
        id,
        dataDir: directory,
        fixture: fixture.origin,
      })
    )

    await new Promise<void>((resolve) => {
      function stop() {
        process.removeListener('SIGTERM', stop)
        process.removeListener('SIGINT', stop)
        resolve()
      }

      process.once('SIGTERM', stop)
      process.once('SIGINT', stop)
    })
  }

  check(
    (await request(`${registryApi}/image`, { method: 'DELETE', body: deletion, cookie })).status ===
      200,
    'administrator can delete a confirmed manifest'
  )

  const remainingTags = await (
    await request(`${registryApi}/tags?repository=team%2Fapi`, { cookie })
  ).json()

  check(
    !remainingTags.items.includes('latest') && !remainingTags.items.includes('stable'),
    'all tags sharing the deleted digest become unavailable'
  )

  check(
    (await request(registryApi, { method: 'DELETE', body: {}, cookie })).status === 200,
    'connection can be removed'
  )

  check(
    (await request('/api/auth/logout', { method: 'POST', body: {}, cookie })).status === 200,
    'logout succeeds'
  )

  check(
    (await request('/api/registries', { cookie })).status === 401,
    'logged-out cookie cannot be replayed'
  )

  assertions += await checkAuthentication(base, origin, password)

  const auditDatabase = new DatabaseSync(path.join(directory, 'console.sqlite'), { readOnly: true })

  try {
    const auditRows = auditDatabase.prepare('SELECT actor, action, target FROM audit').all() as {
      actor: string
      action: string
      target: string
    }[]
    const events = new Set(auditRows.map((row) => row.action))

    check(
      [
        'login.password.failed',
        'login.two_factor.failed',
        'login.passkey.failed',
        'security.request.failed',
        'security.verify.success',
      ].every((event) => events.has(event)),
      'failed authentication and account-security checks are recorded'
    )
    check(
      !JSON.stringify(auditRows).includes(password),
      'audit records do not expose submitted passwords'
    )
  } finally {
    auditDatabase.close()
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const malformed = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{',
    })

    check(malformed.status === 400, 'malformed request is rejected without a shared lockout')
    await malformed.body?.cancel()
  }

  check(
    (
      await request('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password },
      })
    ).status === 200,
    'an unrelated valid account can sign in after malformed requests'
  )

  for (let attempt = 0; attempt < 8; attempt++) {
    await request('/api/auth/login', {
      method: 'POST',
      body: {
        username: 'missing',
        password: 'wrong',
      },
    })
  }

  check(
    (
      await request('/api/auth/login', {
        method: 'POST',
        body: {
          username: 'missing',
          password: 'wrong',
        },
      })
    ).status === 429,
    'repeated failed logins are throttled'
  )

  console.log(`Integration passed (${check.count + assertions} assertions).`)
} finally {
  try {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL')
        }, 5000)

        child.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })

        child.kill('SIGTERM')
      })
    }
  } finally {
    try {
      await Promise.all([fixture.close(), consoleFixture.close(), browsingFixture.close()])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

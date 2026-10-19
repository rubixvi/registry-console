import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type TestContext } from 'node:test'

import { mockBrowsing } from '../fixtures/mock-browsing'
import { mockConsole } from '../fixtures/mock-console'
import { mockRegistry } from '../fixtures/mock-registry'
import { encryptSecret, hashPassword } from './crypto.mjs'
import { availablePort } from './network.mjs'
import { type InspectionProps } from './types'

async function stopServer(child?: ChildProcess): Promise<void> {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    child.kill('SIGTERM')
  })
}

export async function startIntegration(context: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'registry-integration-'))
  const fixtures: { close(): Promise<void> }[] = []
  let child: ChildProcess | undefined

  context.after(async () => {
    try {
      await stopServer(child)
    } finally {
      try {
        await Promise.all(fixtures.map((fixture) => fixture.close()))
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  })

  const fixture = await mockRegistry()

  fixtures.push(fixture)

  const consoleFixture = await mockConsole()

  fixtures.push(consoleFixture)

  const browsingFixture = await mockBrowsing()

  fixtures.push(browsingFixture)

  const port = await availablePort()
  const loopbackHttp = process.env.INTEGRATION_HTTP === 'true'
  const origin = loopbackHttp ? `http://127.0.0.1:${port}` : `https://localhost:${port}`
  const base = `http://127.0.0.1:${port}`
  const password = 'a-long-test-password'
  const hash = hashPassword(password)
  const key = randomBytes(32)
  const encryptedPassword = encryptSecret('registry-secret', key)

  child = spawn(
    process.execPath,
    [
      '--import',
      './scripts/peer.mjs',
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
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
          { username: 'reader', passwordHash: hash, role: 'member' },
          { username: 'public-reader', passwordHash: hash, role: 'viewer' },
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

  child.stdout?.on('data', (chunk) => {
    logs += chunk.toString()
  })
  child.stderr?.on('data', (chunk) => {
    logs += chunk.toString()
  })
  child.once('error', (error) => {
    spawnError = error
  })

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
      const ready = response.ok

      await response.body?.cancel()

      if (ready) {
        return {
          directory,
          fixture,
          consoleFixture,
          browsingFixture,
          base,
          origin,
          password,
          hash,
          encryptedPassword,
          loopbackHttp,
        }
      }
    } catch {
      // The server may not be listening yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Startup timed out\n${logs}`)
}

export async function waitForInspection({ server, cookie, id }: InspectionProps) {
  if (process.env.KEEP_INTEGRATION !== '1') {
    return
  }

  console.log(
    JSON.stringify({
      base: server.base,
      origin: server.origin,
      cookie,
      id,
      dataDir: server.directory,
      fixture: server.fixture.origin,
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

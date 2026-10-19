import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { sourceRequest } from '../helpers/source-request'
import { type ApplicationProps, type AuditProps, type LimitProps } from './types'

export async function checkApplication({
  context,
  request,
  readerCookie,
  server,
}: ApplicationProps) {
  await context.test('Application settings and secrets', { concurrency: false }, async (t) => {
    await t.test('members cannot change settings', async () => {
      const response = await request('/api/settings', {
        method: 'PUT',
        body: {},
        cookie: readerCookie,
      })

      assert.equal(response.status, 403)
    })

    await t.test('saved branding persists and renders without exposing secrets', async () => {
      const settings = {
        name: 'Acme Registry',
        footer: 'Private image library',
        accent: '#7c3aed',
        logoPath: '',
      }

      const updated = await request('/api/settings', {
        method: 'PUT',
        body: settings,
      })

      assert.equal(updated.status, 200)

      const settingsResponse = await request('/api/settings')
      const saved = await settingsResponse.json()

      for (const [key, value] of Object.entries(settings)) {
        assert.equal(saved[key], value, `${key} persists in SQLite`)
      }

      const response = await request('/')
      const html = await response.text()

      assert.ok(html.includes(settings.name))

      for (const secret of ['registry-secret', server.encryptedPassword, server.hash]) {
        assert.ok(!html.includes(secret), 'server-rendered HTML does not expose secrets')
      }
    })

    await t.test('login pages receive a nonce CSP', async () => {
      const response = await request('/login', { cookie: '' })
      const csp = response.headers.get('content-security-policy') ?? ''

      assert.ok(csp.includes("'nonce-"))
      assert.ok(!csp.includes("script-src 'unsafe-inline'"))
      await response.body?.cancel()
    })

    await t.test('database files do not contain plaintext registry passwords', () => {
      for (const name of ['console.sqlite', 'console.sqlite-wal']) {
        const filename = path.join(server.directory, name)

        if (existsSync(filename)) {
          const bytes = readFileSync(filename)

          assert.ok(!bytes.includes(Buffer.from('registry-secret')), `${name} contains no password`)
        }
      }
    })
  })
}

export async function checkAuthenticationAudit({ context, directory, password }: AuditProps) {
  await context.test('Authentication auditing records failures without passwords', () => {
    const database = new DatabaseSync(path.join(directory, 'console.sqlite'), { readOnly: true })

    try {
      const rows = database.prepare('SELECT actor, action, target FROM audit').all() as {
        actor: string
        action: string
        target: string
      }[]
      const events = new Set(rows.map((row) => row.action))

      for (const event of [
        'login.password.failed',
        'login.two_factor.failed',
        'login.passkey.failed',
        'security.request.failed',
        'security.verify.success',
      ]) {
        assert.ok(events.has(event), `${event} is recorded`)
      }

      assert.ok(!JSON.stringify(rows).includes(password), 'audit records do not expose passwords')
    } finally {
      database.close()
    }
  })
}

export async function checkLoginLimits({ context, request, base, origin, password }: LimitProps) {
  await context.test('Login throttling', { concurrency: false }, async (t) => {
    await t.test(
      'malformed requests are limited by source without locking out other clients',
      async () => {
        for (let attempt = 0; attempt < 30; attempt++) {
          const response = await sourceRequest(base, origin, '127.0.0.2', '{')

          assert.equal(response.status, 400, `malformed request ${attempt + 1} is rejected`)
        }

        const limited = await sourceRequest(base, origin, '127.0.0.2', '{')

        assert.equal(limited.status, 429)
        assert.ok(Number(limited.retry) > 0)

        const response = await request('/api/auth/login', {
          method: 'POST',
          body: { username: 'admin', password },
        })

        assert.equal(response.status, 200)
      }
    )

    await t.test('repeated failed logins are throttled', async () => {
      const body = { username: 'missing', password: 'wrong' }

      for (let attempt = 0; attempt < 8; attempt++) {
        const response = await sourceRequest(base, origin, '127.0.0.3', JSON.stringify(body))

        assert.equal(response.status, 401)
      }

      const response = await sourceRequest(base, origin, '127.0.0.3', JSON.stringify(body))

      assert.equal(response.status, 429)
    })
  })
}

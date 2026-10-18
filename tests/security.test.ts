import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { NextRequest } from 'next/server'

import { POST as login } from '../src/app/api/auth/login/route'
import { securityAccounts, securityId } from '../src/lib/auth/accounts'
import { auditAuthFailure } from '../src/lib/auth/audit'
import { limitSignIn } from '../src/lib/auth/limit'
import { createSession, resolveSession, tokenHash } from '../src/lib/auth/session'
import { generateTotpSecret, getAuthenticator } from '../src/lib/auth/totp'
import { userFingerprint, users } from '../src/lib/config/users'
import { database } from '../src/lib/database/client'
import { apiError } from '../src/lib/security/api'
import { encryptSecret } from '../src/lib/security/crypto'
import { AppError } from '../src/lib/security/error'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-security-fixes-'))
const password = 'security-regression-test-password'

function hashPassword(): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })

  return `scrypt$32768$8$1$${salt.toString('hex')}$${hash.toString('hex')}`
}

const owner = {
  username: 'owner',
  passwordHash: hashPassword(),
  role: 'admin' as const,
}
let member = {
  username: 'member',
  passwordHash: hashPassword(),
  role: 'viewer' as 'admin' | 'viewer',
}

Object.assign(process.env, {
  APP_ORIGIN: 'https://security.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'd'.repeat(64),
  AUTH_USERS_JSON: JSON.stringify([owner, member]),
  TRUST_PROXY: 'false',
})

function request(body: string, address = '192.0.2.1'): NextRequest {
  return new NextRequest('https://security.example.com/api/auth/login', {
    method: 'POST',
    headers: {
      Origin: 'https://security.example.com',
      'Content-Type': 'application/json',
      'X-Forwarded-For': address,
    },
    body,
  })
}

after(() => {
  database().close()

  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
})

test('legacy enrollment migrates without MFA downgrade, and role/hash changes retain factors while revoking sessions', async () => {
  const original = users().find((user) => user.username === 'member')!
  const session = createSession(original)
  const encrypted = encryptSecret(generateTotpSecret())
  const db = database()

  db.prepare('INSERT INTO authenticators VALUES (?, ?, ?, ?, ?)').run(
    original.username,
    userFingerprint(original),
    encrypted,
    -1,
    '[]'
  )
  db.prepare(
    "INSERT INTO passkeys VALUES ('legacy-key', ?, ?, 'handle', 'public', 0, '[]', 'Legacy', 'now', NULL)"
  ).run(original.username, userFingerprint(original))
  securityAccounts(users())

  const stableId = securityId(original)

  assert.equal(getAuthenticator(original)?.fingerprint, stableId)
  assert.equal(getAuthenticator(original)?.secret, encrypted)
  assert.equal(resolveSession(session.token), null)
  assert.equal(
    (
      db.prepare("SELECT fingerprint FROM passkeys WHERE id = 'legacy-key'").get() as {
        fingerprint: string
      }
    ).fingerprint,
    stableId
  )

  for (const change of [{ role: 'admin' as const }, { passwordHash: hashPassword() }]) {
    const previous = createSession(users().find((user) => user.username === 'member')!)

    member = { ...member, ...change }
    process.env.AUTH_USERS_JSON = JSON.stringify([owner, member])
    securityAccounts(users())

    const current = users().find((user) => user.username === 'member')!

    assert.equal(securityId(current), stableId)
    assert.equal(getAuthenticator(current)?.secret, encrypted)
    assert.equal(resolveSession(previous.token), null)

    const response = await login(request(JSON.stringify({ username: member.username, password })))

    assert.equal(response.status, 200)
    assert.equal((await response.json()).requiresTwoFactor, true)
    assert.ok(!response.headers.getSetCookie().some((entry) => entry.includes('registry_session=')))
  }
})

test('malformed requests and spoofed forwarded headers cannot create a persistent shared login lockout', async () => {
  database().prepare('DELETE FROM limits').run()

  for (let index = 0; index < 30; index++) {
    assert.equal((await login(request('{', `192.0.2.${index + 1}`))).status, 400)
  }

  const response = await login(
    request(JSON.stringify({ username: owner.username, password }), '198.51.100.2')
  )

  assert.equal(response.status, 200)
  assert.equal((await response.json()).success, true)

  const shared = database()
    .prepare('SELECT id FROM limits WHERE id = ?')
    .get(tokenHash('password-source:all'))

  assert.equal(shared, undefined)
  database().prepare('DELETE FROM limits').run()

  for (let index = 0; index < 8; index++) {
    assert.equal(
      (
        await login(
          request(
            JSON.stringify({ username: 'unknown', password: 'wrong' }),
            `192.0.2.${index + 1}`
          )
        )
      ).status,
      401
    )
  }

  assert.equal(
    (
      await login(
        request(JSON.stringify({ username: 'unknown', password: 'wrong' }), '198.51.100.2')
      )
    ).status,
    429
  )
})

test('server capacity protection recovers after one second and returns the correct retry delay', (context) => {
  let now = Date.now() + 60_000

  context.mock.method(Date, 'now', () => now)

  for (let index = 0; index < 120; index++) {
    limitSignIn(request('{}'), 'passkey')
  }

  assert.throws(
    () => limitSignIn(request('{}'), 'passkey'),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.status, 503)
      assert.equal(apiError(error).headers.get('Retry-After'), '1')

      return true
    }
  )
  now += 1000
  assert.doesNotThrow(() => limitSignIn(request('{}'), 'passkey'))
})

test('explicit account replacement and removal revoke old security methods', () => {
  const current = users().find((user) => user.username === 'member')!
  const previousId = securityId(current)
  const previousSession = createSession(current)

  process.env.AUTH_USERS_JSON = JSON.stringify([
    owner,
    { ...member, id: 'bd45762c-d44b-45e7-9217-93587f2b217f' },
  ])
  securityAccounts(users())

  const replacement = users().find((user) => user.username === 'member')!

  assert.notEqual(securityId(replacement), previousId)
  assert.equal(getAuthenticator(replacement), undefined)
  assert.equal(resolveSession(previousSession.token), null)
  assert.equal(
    database().prepare("SELECT id FROM passkeys WHERE id = 'legacy-key'").get(),
    undefined
  )

  const newSession = createSession(replacement)

  process.env.AUTH_USERS_JSON = JSON.stringify([owner])
  securityAccounts(users())
  assert.equal(resolveSession(newSession.token), null)
  assert.equal(
    database().prepare('SELECT * FROM security_accounts WHERE username = ?').get('member'),
    undefined
  )
})

test('failure audit records include actor, event, and status without submitted credentials', () => {
  auditAuthFailure('owner', 'login.passkey.failed', new AppError(401, 'A private submitted value'))

  const row = database()
    .prepare(
      "SELECT actor, action, target FROM audit WHERE action = 'login.passkey.failed' ORDER BY id DESC LIMIT 1"
    )
    .get() as { actor: string; action: string; target: string }

  assert.equal(row.actor, 'owner')
  assert.equal(JSON.parse(row.target).status, 401)
  assert.ok(!row.target.includes('private'))
  assert.ok(database().prepare("SELECT id FROM audit WHERE action = 'login.password.failed'").get())
})

test('operator reset explicitly removes security methods and sessions for only the named account', () => {
  const user = users()[0]
  const db = database()
  const id = securityId(user)
  const session = createSession(user)

  db.prepare('INSERT INTO authenticators VALUES (?, ?, ?, ?, ?)').run(
    user.username,
    id,
    encryptSecret(generateTotpSecret()),
    -1,
    '[]'
  )
  db.prepare(
    "INSERT INTO passkeys VALUES ('reset-test-key', ?, ?, 'handle', 'public', 0, '[]', 'Test', 'now', NULL)"
  ).run(user.username, id)

  const result = spawnSync(process.execPath, ['scripts/reset-security.mjs', user.username], {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: directory },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(resolveSession(session.token), null)
  assert.equal(
    db.prepare('SELECT * FROM authenticators WHERE username = ?').get(user.username),
    undefined
  )
  assert.equal(db.prepare("SELECT * FROM passkeys WHERE id = 'reset-test-key'").get(), undefined)
  assert.equal(
    db.prepare('SELECT * FROM security_accounts WHERE username = ?').get(user.username),
    undefined
  )
  assert.ok(
    db
      .prepare("SELECT id FROM audit WHERE action = 'security.account.reset' AND target = ?")
      .get(user.username)
  )
})

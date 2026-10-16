import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { NextResponse } from 'next/server'

import { securityId } from '../src/lib/auth/accounts'
import { disableAuthenticator, enableAuthenticator } from '../src/lib/auth/authenticator'
import { verifyLogin } from '../src/lib/auth/login'
import { findPasskey, removePasskey } from '../src/lib/auth/passkey'
import { issueRequest, readRequest } from '../src/lib/auth/requests'
import { createSession, resolveSession } from '../src/lib/auth/session'
import { generateTotpSecret, getAuthenticator, recoveryHash, totpCode } from '../src/lib/auth/totp'
import { users } from '../src/lib/config/users'
import { database } from '../src/lib/database/client'
import { databaseReady } from '../src/lib/database/health'
import { encryptSecret } from '../src/lib/security/crypto'
import { getSettings, removeLogo, updateSettings } from '../src/lib/settings'
import { getLogo } from '../src/lib/settings/logo'
import { type User } from '../src/types/auth'
import { type Purpose } from '../src/types/security'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-storage-'))
const salt = Buffer.alloc(16, 7)
const hash = scryptSync('test-password', salt, 32, {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
})
const passwordHash = `scrypt$32768$8$1$${salt.toString('hex')}$${hash.toString('hex')}`

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: '7'.repeat(64),
  AUTH_USERS_JSON: JSON.stringify([
    { username: 'owner', role: 'admin', passwordHash },
    { username: 'other', role: 'viewer', passwordHash },
  ]),
})

const [owner, other] = users()

function pending(user: User, purpose: Purpose, value = '') {
  const response = NextResponse.json({})

  issueRequest(response, purpose, user, value)

  return readRequest(
    new Request('https://console.example.com', {
      headers: { Cookie: response.headers.getSetCookie()[0].split(';')[0] },
    }),
    purpose
  )
}

function rejectAudit(action: string): void {
  database().exec(`
    CREATE TEMP TRIGGER reject_audit BEFORE INSERT ON audit
    WHEN NEW.action = '${action}'
    BEGIN
      SELECT RAISE(ABORT, 'test audit failure');
    END;
  `)
}

beforeEach(() => {
  const db = database()

  db.exec('DROP TRIGGER IF EXISTS reject_audit')

  for (const table of [
    'sessions',
    'auth_requests',
    'authenticators',
    'passkeys',
    'audit',
    'settings',
  ]) {
    db.exec(`DELETE FROM ${table}`)
  }

  securityId(owner)
  securityId(other)
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

test('branding, logo and audit changes commit together and roll back together', () => {
  const original = getSettings()
  const settings = { ...original, name: 'Updated', logoPath: '/logo.png' }
  const logo = Buffer.from('test logo storage')

  updateSettings({ settings, username: owner.username, logo })

  assert.equal(getSettings().name, 'Updated')
  assert.deepEqual(getLogo(), logo)

  rejectAudit('settings.logo.remove')

  assert.throws(() => removeLogo(owner.username), /test audit failure/)
  assert.deepEqual(getLogo(), logo)
  assert.equal(getSettings().logoPath, '/logo.png')

  database().exec('DROP TRIGGER reject_audit')
  rejectAudit('settings.update')

  assert.throws(
    () => updateSettings({ settings: original, username: owner.username, remove: true }),
    /test audit failure/
  )
  assert.deepEqual(getLogo(), logo)
  assert.equal(getSettings().name, 'Updated')

  database().exec('DROP TRIGGER reject_audit')
  removeLogo(owner.username)

  assert.equal(getLogo(), null)
  assert.equal(getSettings().logoPath, '')
  assert.equal(getSettings().name, 'Updated')
})

test('authenticator enrollment rolls back secrets, session revocation and challenge consumption on failure', () => {
  const secret = generateTotpSecret()
  const request = pending(owner, 'totp-setup', encryptSecret(secret))
  const existing = createSession(owner)
  const code = totpCode(secret, Math.floor(Date.now() / 30_000))

  rejectAudit('security.totp.enabled')

  assert.throws(() => enableAuthenticator(owner, request, code), /test audit failure/)
  assert.equal(getAuthenticator(owner), undefined)
  assert.ok(resolveSession(existing.token))
  assert.ok(database().prepare('SELECT id FROM auth_requests WHERE id = ?').get(request.id))

  database().exec('DROP TRIGGER reject_audit')

  const enrollment = enableAuthenticator(owner, request, code)
  const authenticator = getAuthenticator(owner)!

  assert.equal(resolveSession(existing.token), null)
  assert.ok(resolveSession(enrollment.session.token))
  assert.equal(enrollment.codes.length, 10)
  assert.notEqual(authenticator.secret, secret)
  assert.deepEqual(JSON.parse(authenticator.recovery), enrollment.codes.map(recoveryHash))
  assert.throws(() => enableAuthenticator(owner, request, code), /already enabled/)
})

test('expired and foreign enrollment requests cannot enable an authenticator', () => {
  const secret = generateTotpSecret()
  const code = totpCode(secret, Math.floor(Date.now() / 30_000))
  const request = pending(owner, 'totp-setup', encryptSecret(secret))

  assert.throws(() => enableAuthenticator(other, request, code), /Invalid authenticator setup/)

  database().prepare('UPDATE auth_requests SET expires = 0 WHERE id = ?').run(request.id)

  assert.throws(() => enableAuthenticator(owner, request, code), /expired/)
  assert.equal(getAuthenticator(owner), undefined)
})

test('two-factor login rolls back used codes and consumed challenges when session auditing fails', () => {
  const secret = generateTotpSecret()
  const code = totpCode(secret, Math.floor(Date.now() / 30_000))
  const enrollment = enableAuthenticator(
    owner,
    pending(owner, 'totp-setup', encryptSecret(secret)),
    code
  )
  const request = pending(owner, 'two-factor')
  const recovery = enrollment.codes[0]

  rejectAudit('login.two_factor')

  assert.throws(() => verifyLogin(owner, request, recovery), /test audit failure/)
  assert.equal((JSON.parse(getAuthenticator(owner)!.recovery) as string[]).length, 10)
  assert.ok(database().prepare('SELECT id FROM auth_requests WHERE id = ?').get(request.id))
  assert.equal(
    (database().prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count,
    1
  )

  database().exec('DROP TRIGGER reject_audit')

  const response = verifyLogin(owner, request, recovery)

  assert.equal(response.status, 200)
  assert.ok(response.headers.getSetCookie().some((cookie) => cookie.includes('registry_session=')))
  assert.equal((JSON.parse(getAuthenticator(owner)!.recovery) as string[]).length, 9)
  assert.throws(() => verifyLogin(owner, request, recovery), /expired/)
  assert.throws(() => verifyLogin(other, request, recovery), /expired/)
})

test('authenticator removal revokes only the selected account and rolls back if auditing fails', () => {
  const secret = generateTotpSecret()

  enableAuthenticator(
    owner,
    pending(owner, 'totp-setup', encryptSecret(secret)),
    totpCode(secret, Math.floor(Date.now() / 30_000))
  )

  const session = createSession(owner)
  const foreign = createSession(other)

  rejectAudit('security.totp.disabled')

  assert.throws(() => disableAuthenticator(owner.username), /test audit failure/)
  assert.ok(getAuthenticator(owner))
  assert.ok(resolveSession(session.token))

  database().exec('DROP TRIGGER reject_audit')
  disableAuthenticator(owner.username)

  assert.equal(getAuthenticator(owner), undefined)
  assert.equal(resolveSession(session.token), null)
  assert.ok(resolveSession(foreign.token))
})

test('passkey deletion stays bound to its owner and health checks query the database', () => {
  database()
    .prepare(`
      INSERT INTO passkeys (
        id, username, fingerprint, user_id, public_key, counter, transports, name, created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      'key',
      owner.username,
      securityId(owner),
      'user',
      'public',
      0,
      '[]',
      'Test',
      new Date().toISOString()
    )

  removePasskey(other, 'key')
  assert.ok(findPasskey('key'))

  removePasskey(owner, 'key')
  assert.equal(findPasskey('key'), undefined)
  assert.equal(databaseReady(), true)
})

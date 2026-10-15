import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { NextResponse } from 'next/server'

import { authPasskey, findPasskey, registerPasskey, regOptions } from '../src/lib/auth/passkeys'
import { issueRequest, readRequest, requireSecurity } from '../src/lib/auth/requests'
import {
  generateTotpSecret,
  getAuthenticator,
  recoveryCodes,
  recoveryHash,
  totpCode,
  totpStep,
  verifySecondFactor,
} from '../src/lib/auth/totp'
import { userFingerprint, users } from '../src/lib/config/users'
import { database } from '../src/lib/database/client'
import { decryptSecret, encryptSecret } from '../src/lib/security/crypto'
import { virtualPasskey } from './fixtures/passkey'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-auth-'))
const salt = randomBytes(16)

const hash = scryptSync('test-password', salt, 32, {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
})

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'b'.repeat(64),
  AUTH_USERS_JSON: '',
  AUTH_USERNAME: 'admin',
  AUTH_PASSWORD_HASH: `scrypt$32768$8$1$${salt.toString('hex')}$${hash.toString('hex')}`,
})

const user = users()[0]

after(() => {
  database().close()

  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
})

test('TOTP matches RFC 6238 SHA-1 vectors at six digits and permits only one step of clock drift', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  for (const [time, code] of [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ] as const) {
    assert.equal(totpCode(secret, Math.floor(time / 30)), code)
  }

  const now = 1234567890000
  const step = Math.floor(now / 30000)

  assert.equal(totpStep(secret, totpCode(secret, step - 1), now), step - 1)

  assert.equal(totpStep(secret, totpCode(secret, step + 1), now), step + 1)

  assert.equal(totpStep(secret, totpCode(secret, step - 2), now), null)

  assert.equal(totpStep(secret, 'abc123', now), null)
  assert.match(generateTotpSecret(), /^[A-Z2-7]{32}$/)
})

test('authenticator secrets are encrypted and TOTP/recovery codes cannot be replayed', () => {
  const secret = generateTotpSecret()
  const codes = recoveryCodes()

  database()
    .prepare('INSERT INTO authenticators VALUES (?, ?, ?, ?, ?)')
    .run(
      user.username,
      userFingerprint(user),
      encryptSecret(secret),
      -1,
      JSON.stringify(codes.map(recoveryHash))
    )

  const row = getAuthenticator(user)!

  assert.notEqual(row.secret, secret)
  assert.equal(decryptSecret(row.secret), secret)
  assert.ok(!row.recovery.includes(codes[0]))

  const code = totpCode(secret, Math.floor(Date.now() / 30000))

  verifySecondFactor(user, code)

  assert.throws(() => verifySecondFactor(user, code))

  verifySecondFactor(user, codes[0])

  assert.throws(() => verifySecondFactor(user, codes[0]))

  assert.equal((JSON.parse(getAuthenticator(user)!.recovery) as string[]).length, 9)

  assert.equal(
    getAuthenticator({
      ...user,
      passwordHash: `${user.passwordHash}changed`,
    })?.secret,
    row.secret
  )

  assert.equal(
    getAuthenticator({
      ...user,
      role: 'viewer',
    })?.secret,
    row.secret
  )
})

test('challenges are single-use, purpose-bound, expiring, and session-bound', () => {
  const response = NextResponse.json({})

  issueRequest(response, 'passkey-register', user, 'challenge', 'session-hash')

  const cookie = response.headers.getSetCookie()[0].split(';')[0]

  const request = new Request('https://console.example.com', {
    headers: {
      Cookie: cookie,
    },
  })

  assert.throws(() => readRequest(request, 'passkey-login', true))

  assert.throws(() => readRequest(request, 'passkey-register', true), /session/)

  const login = NextResponse.json({})

  issueRequest(login, 'passkey-login', null, 'challenge')

  const loginRequest = new Request('https://console.example.com', {
    headers: {
      Cookie: login.headers.getSetCookie()[0].split(';')[0],
    },
  })

  assert.equal(readRequest(loginRequest, 'passkey-login', true).value, 'challenge')

  assert.throws(() => readRequest(loginRequest, 'passkey-login', true))

  const expired = NextResponse.json({})

  issueRequest(expired, 'two-factor', user)

  database().prepare("UPDATE auth_requests SET expires = 0 WHERE purpose = 'two-factor'").run()

  const expiredRequest = new Request('https://console.example.com', {
    headers: {
      Cookie: expired.headers.getSetCookie()[0].split(';')[0],
    },
  })

  assert.throws(() => readRequest(expiredRequest, 'two-factor'))
  assert.throws(() => requireSecurity(request, user.username))
})

test('passkeys verify real signatures, require device verification, and bind origin, challenge, owner, and user handle', async () => {
  const device = virtualPasskey()
  const { options, userId } = await regOptions(user)
  const origin = process.env.APP_ORIGIN!

  await assert.rejects(
    registerPasskey(
      user,
      device.registration(options.challenge, origin, false),
      options.challenge,
      userId,
      'Test'
    )
  )

  await registerPasskey(
    user,
    device.registration(options.challenge, origin),
    options.challenge,
    userId,
    'Test'
  )

  await assert.rejects(
    registerPasskey(
      user,
      device.registration(options.challenge, origin),
      options.challenge,
      userId,
      'Test'
    )
  )

  const handle = Buffer.from(userId, 'hex').toString('base64url')
  const challenge = randomBytes(32).toString('base64url')

  await assert.rejects(
    authPasskey(user, device.authentication(challenge, origin, handle, false), challenge)
  )

  await assert.rejects(
    authPasskey(
      user,
      device.authentication(challenge, 'https://other.example.com', handle),
      challenge
    )
  )

  await assert.rejects(authPasskey(user, device.authentication(challenge, origin, handle), 'wrong'))

  await assert.rejects(
    authPasskey(user, device.authentication(challenge, origin, 'wrong'), challenge)
  )

  const assertion = device.authentication(challenge, origin, handle)

  await authPasskey(user, assertion, challenge)

  assert.ok(findPasskey(device.id)?.last_used)

  await assert.rejects(authPasskey(user, assertion, challenge))

  await authPasskey(
    {
      ...user,
      passwordHash: 'changed',
    },
    device.authentication(challenge, origin, handle),
    challenge
  )

  await authPasskey(
    {
      ...user,
      role: 'viewer',
    },
    device.authentication(challenge, origin, handle),
    challenge
  )

  await assert.rejects(
    authPasskey(
      {
        ...user,
        username: 'another-user',
      },
      device.authentication(challenge, origin, handle),
      challenge
    )
  )

  const tampered = device.authentication(challenge, origin, handle)

  tampered.response.signature = randomBytes(70).toString('base64url')

  await assert.rejects(authPasskey(user, tampered, challenge))
})

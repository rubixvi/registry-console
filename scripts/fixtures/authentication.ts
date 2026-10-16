import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import { virtualPasskey } from '../../tests/fixtures/passkey'
import { createRequest, signIn } from '../helpers/testing'
import { type TestRequest } from '../helpers/types'
import {
  type Account,
  type AuthenticationProps,
  type Authenticator,
  type PasskeyAccess,
  type PasskeySignIn,
} from './types'

export async function checkAuthentication({
  base,
  origin,
  password,
}: AuthenticationProps): Promise<void> {
  const jar = new Map<string, string>()
  const request = createRequest({ base, origin, jar, method: 'POST' })
  const credentials = { username: 'reader', password }

  await checkEnrollmentAccess(request)
  await signIn({ request, ...credentials })

  const oldCookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ')

  await unlockSecurity({ request, credentials })

  const passkey = await enrollPasskey({ request, origin })
  const authenticator = await enableAuthenticator({ request, oldCookie })

  await checkTwoFactorLogin({ request, credentials, authenticator })
  await checkRecoveryCodes({ request, credentials, authenticator })
  await checkPasskeyAccess({ base, origin, password, request, jar, passkey, authenticator })
  await disableAuthenticator({ request, credentials, authenticator })
}

async function checkEnrollmentAccess(request: TestRequest) {
  const anonymous = await request('/api/account/passkeys/options')
  const foreign = await request('/api/auth/passkey/options', {
    cookie: '',
    origin: 'https://evil.example',
  })

  assert.equal(anonymous.status, 401, 'passkey enrollment requires a session')
  assert.equal(foreign.status, 403, 'passkey login rejects cross-origin options')
}

async function unlockSecurity({ request, credentials }: Account) {
  const page = await request('/account', { method: 'GET' })
  const enrollment = await request('/api/account/passkeys/options')
  const incorrect = await request('/api/account/security/verify', { body: { password: 'wrong' } })
  const verified = await request('/api/account/security/verify', {
    body: { password: credentials.password },
  })

  assert.equal(page.status, 200, 'viewers have an account security page')
  assert.equal(enrollment.status, 400, 'enrollment requires fresh verification')
  assert.equal(incorrect.status, 401, 'incorrect reauthentication is rejected')
  assert.equal(verified.status, 200, 'password unlocks initial security setup')
}

async function enrollPasskey({ request, origin }: { request: TestRequest; origin: string }) {
  const device = virtualPasskey()
  const response = await request('/api/account/passkeys/options')

  assert.equal(response.status, 200, 'passkey enrollment options are issued')

  const options = await response.json()

  assert.equal(options.authenticatorSelection.userVerification, 'required')
  assert.equal(options.authenticatorSelection.residentKey, 'required')

  const unverified = await request('/api/account/passkeys/verify', {
    body: {
      name: 'Test device',
      credential: device.registration(options.challenge, origin, false),
    },
  })

  assert.equal(unverified.status, 400, 'registration without user verification fails')

  const freshResponse = await request('/api/account/passkeys/options')
  const fresh = await freshResponse.json()
  const registration = {
    name: 'Test device',
    credential: device.registration(fresh.challenge, origin),
  }

  const registered = await request('/api/account/passkeys/verify', { body: registration })

  assert.equal(registered.status, 200, 'valid signed passkey registration succeeds')

  const replay = await request('/api/account/passkeys/verify', { body: registration })

  assert.equal(replay.status, 400, 'registration challenge cannot be replayed')

  return { device, handle: fresh.user.id as string }
}

async function enableAuthenticator({
  request,
  oldCookie,
}: {
  request: TestRequest
  oldCookie: string
}) {
  const response = await request('/api/account/totp/setup')

  assert.equal(response.status, 200, 'authenticator setup is issued')

  const setup = await response.json()

  assert.match(setup.qrCode, /^data:image\/png;base64,/, 'setup returns a local QR image')

  const invalid = await request('/api/account/totp', { body: { code: 'invalid' } })

  assert.equal(invalid.status, 400, 'invalid setup code cannot enable 2FA')

  const step = Math.floor(Date.now() / 30000)
  const confirmed = await request('/api/account/totp', {
    body: { code: code(setup.secret, step - 1) },
  })

  assert.equal(confirmed.status, 200, 'authenticator is confirmed')

  const recovery = (await confirmed.json()).recoveryCodes as string[]
  const revoked = await request('/api/registries', { method: 'GET', cookie: oldCookie })

  assert.equal(recovery.length, 10, 'recovery codes are issued on confirmation')
  assert.equal(revoked.status, 401, 'enabling 2FA revokes previously issued sessions')

  return { secret: setup.secret as string, step, recovery }
}

async function checkTwoFactorLogin({
  request,
  credentials,
  authenticator,
}: Account & { authenticator: Authenticator }) {
  await request('/api/auth/logout')

  const login = await request('/api/auth/login', { body: credentials })
  const result = await login.json()

  assert.equal(result.requiresTwoFactor, true, 'password now requires the second factor')
  assert.ok(
    !login.headers.getSetCookie().some((entry) => entry.includes('registry_session=')),
    'password alone never receives a session cookie'
  )

  const pending = await request('/api/registries', { method: 'GET' })
  const invalid = await request('/api/auth/login/verify', { body: { code: 'wrong' } })

  assert.equal(pending.status, 401, 'pending second factor cannot access APIs')
  assert.equal(invalid.status, 401, 'invalid second factor is rejected')

  const body = { code: code(authenticator.secret, authenticator.step) }
  const verified = await request('/api/auth/login/verify', { body })

  assert.equal(verified.status, 200, 'password and valid TOTP create a session')

  const authenticated = await request('/api/registries', { method: 'GET' })
  const replay = await request('/api/auth/login/verify', { body })

  assert.equal(authenticated.status, 200, 'completed 2FA grants access')
  assert.equal(replay.status, 400, 'completed login challenge cannot be replayed')
}

async function checkRecoveryCodes({
  request,
  credentials,
  authenticator,
}: Account & { authenticator: Authenticator }) {
  await request('/api/auth/logout')
  await request('/api/auth/login', { body: credentials })

  const replayedTotp = await request('/api/auth/login/verify', {
    body: { code: code(authenticator.secret, authenticator.step) },
  })
  const body = { code: authenticator.recovery[0] }
  const recovered = await request('/api/auth/login/verify', { body })

  assert.equal(replayedTotp.status, 401, 'TOTP cannot be reused in a fresh challenge')
  assert.equal(recovered.status, 200, 'one-time recovery code completes sign-in')

  await request('/api/auth/logout')
  await request('/api/auth/login', { body: credentials })

  const replay = await request('/api/auth/login/verify', { body })

  assert.equal(replay.status, 401, 'recovery code cannot be reused')
}

async function passkeySignIn({
  request,
  origin,
  passkey,
  verified,
}: PasskeySignIn): Promise<Response> {
  const response = await request('/api/auth/passkey/options')
  const options = await response.json()

  assert.equal(options.userVerification, 'required', 'passkey sign-in requires user verification')

  return request('/api/auth/passkey/verify', {
    body: passkey.device.authentication(options.challenge, origin, passkey.handle, verified),
  })
}

async function checkPasskeyAccess({
  base,
  origin,
  password,
  request,
  jar,
  passkey,
  authenticator,
}: PasskeyAccess) {
  const unverified = await passkeySignIn({ request, origin, passkey, verified: false })
  const verified = await passkeySignIn({ request, origin, passkey, verified: true })
  const authenticated = await request('/api/registries', { method: 'GET' })

  assert.equal(unverified.status, 401, 'unverified passkey cannot bypass 2FA')
  assert.equal(verified.status, 200, 'verified passkey signs in without a TOTP prompt')
  assert.equal(authenticated.status, 200, 'verified passkey grants API access')

  const passwordOnly = await request('/api/account/security/verify', { body: { password } })
  const unlocked = await request('/api/account/security/verify', {
    body: { password, code: authenticator.recovery[1] },
  })

  assert.equal(passwordOnly.status, 401, 'security changes require the existing second factor')
  assert.equal(unlocked.status, 200, 'password and recovery code unlock security changes')

  await checkSecurityGrant({ base, origin, password, request, jar, passkey })

  const removed = await request('/api/account/passkeys', {
    method: 'DELETE',
    body: { id: passkey.device.id },
  })

  assert.equal(removed.status, 200, 'owner can remove a passkey')

  await request('/api/auth/logout')

  const removedLogin = await passkeySignIn({ request, origin, passkey, verified: true })

  assert.equal(removedLogin.status, 401, 'removed passkey cannot sign in')
}

async function checkSecurityGrant({
  base,
  origin,
  password,
  request,
  jar,
  passkey,
}: Omit<PasskeyAccess, 'authenticator'>) {
  const other = await signIn({
    request: createRequest({ base, origin }),
    username: 'admin',
    password,
  })
  const grantCookie = [...jar]
    .filter(([name]) => name.includes('registry_security'))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
  const response = await request('/api/account/passkeys', {
    method: 'DELETE',
    body: { id: passkey.device.id },
    cookie: `${other.cookie}; ${grantCookie}`,
  })

  assert.equal(response.status, 403, 'security grants cannot be transferred between sessions')
}

async function disableAuthenticator({
  request,
  credentials,
  authenticator,
}: Account & { authenticator: Authenticator }) {
  await request('/api/auth/login', { body: credentials })

  const recovered = await request('/api/auth/login/verify', {
    body: { code: authenticator.recovery[2] },
  })
  const verified = await request('/api/account/security/verify', {
    body: { password: credentials.password, code: authenticator.recovery[3] },
  })

  assert.equal(recovered.status, 200, 'another recovery code works')
  assert.equal(verified.status, 200, 'fresh verification permits disabling 2FA')

  const disabled = await request('/api/account/totp', { method: 'DELETE' })
  const revoked = await request('/api/registries', { method: 'GET' })

  assert.equal(disabled.status, 200, 'authenticator can be disabled')
  assert.equal(revoked.status, 401, 'disabling 2FA revokes sessions')

  const response = await request('/api/auth/login', { body: credentials })
  const result = await response.json()

  assert.equal(result.success, true, 'password-only login is restored after disabling 2FA')
}

function code(secret: string, step: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret]
    .map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, '0'))
    .join('')
  const key = Buffer.from(bits.match(/.{8}/g)!.map((part) => Number.parseInt(part, 2)))
  const time = Buffer.alloc(8)

  time.writeBigUInt64BE(BigInt(step))

  const digest = createHmac('sha1', key).update(time).digest()

  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0')
}

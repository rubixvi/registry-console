import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import { virtualPasskey } from '../../tests/fixtures/passkey'

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

export async function authenticationChecks(
  base: string,
  origin: string,
  password: string
): Promise<number> {
  const jar = new Map<string, string>()

  let assertions = 0

  function check(value: unknown, message: string): void {
    assert.ok(value, message)

    assertions++
  }

  async function request(
    url: string,
    method = 'POST',
    body?: unknown,
    cookies?: string,
    source = origin
  ): Promise<Response> {
    const response = await fetch(`${base}${url}`, {
      method,
      headers: {
        Origin: source,
        'Content-Type': 'application/json',
        Cookie: cookies ?? [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    })

    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]
      const index = pair.indexOf('=')

      jar.set(pair.slice(0, index), pair.slice(index + 1))
    }

    return response
  }

  const credentials = {
    username: 'reader',
    password,
  }

  check(
    (await request('/api/account/passkeys/options')).status === 401,
    'passkey enrollment requires a session'
  )

  check(
    (await request('/api/auth/passkey/options', 'POST', undefined, '', 'https://evil.example'))
      .status === 403,
    'passkey login rejects cross-origin options'
  )

  check(
    (await request('/api/auth/login', 'POST', credentials)).status === 200,
    'viewer can sign in'
  )

  const oldCookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ')

  check((await request('/account', 'GET')).status === 200, 'viewers have an account security page')

  check(
    (await request('/api/account/passkeys/options')).status === 400,
    'enrollment requires fresh verification'
  )

  check(
    (
      await request('/api/account/security/verify', 'POST', {
        password: 'wrong',
      })
    ).status === 401,
    'incorrect reauthentication is rejected'
  )

  check(
    (
      await request('/api/account/security/verify', 'POST', {
        password,
      })
    ).status === 200,
    'password unlocks initial security setup'
  )

  const device = virtualPasskey()

  let response = await request('/api/account/passkeys/options')

  check(response.status === 200, 'passkey enrollment options are issued')

  let options = await response.json()

  check(
    options.authenticatorSelection.userVerification === 'required' &&
      options.authenticatorSelection.residentKey === 'required',
    'registration requires verified discoverable credentials'
  )

  check(
    (
      await request('/api/account/passkeys/verify', 'POST', {
        name: 'Test device',
        credential: device.registration(options.challenge, origin, false),
      })
    ).status === 400,
    'registration without user verification fails'
  )

  response = await request('/api/account/passkeys/options')
  options = await response.json()

  const handle = options.user.id as string

  const registration = {
    name: 'Test device',
    credential: device.registration(options.challenge, origin),
  }

  response = await request('/api/account/passkeys/verify', 'POST', registration)

  check(response.status === 200, `valid signed passkey registration succeeds (${response.status})`)

  check(
    (await request('/api/account/passkeys/verify', 'POST', registration)).status === 400,
    'registration challenge cannot be replayed'
  )

  response = await request('/api/account/totp/setup')

  check(response.status === 200, 'authenticator setup is issued')

  const setup = await response.json()

  check(/^data:image\/png;base64,/.test(setup.qrCode), 'setup returns a local QR image')

  check(
    (
      await request('/api/account/totp', 'POST', {
        code: 'invalid',
      })
    ).status === 400,
    'invalid setup code cannot enable 2FA'
  )

  const step = Math.floor(Date.now() / 30000)

  response = await request('/api/account/totp', 'POST', {
    code: code(setup.secret, step - 1),
  })

  check(response.status === 200, `authenticator is confirmed (${response.status})`)

  const recovery = (await response.json()).recoveryCodes as string[]

  check(recovery.length === 10, 'recovery codes are issued on confirmation')

  check(
    (await request('/api/registries', 'GET', undefined, oldCookie)).status === 401,
    'enabling 2FA revokes previously issued sessions'
  )

  await request('/api/auth/logout')

  response = await request('/api/auth/login', 'POST', credentials)

  check(
    (await response.json()).requiresTwoFactor === true,
    'password now requires the second factor'
  )

  check(
    !response.headers.getSetCookie().some((entry) => entry.includes('registry_session=')),
    'password alone never receives a session cookie'
  )

  check(
    (await request('/api/registries', 'GET')).status === 401,
    'pending second factor cannot access APIs'
  )

  check(
    (
      await request('/api/auth/login/verify', 'POST', {
        code: 'wrong',
      })
    ).status === 401,
    'invalid second factor is rejected'
  )

  response = await request('/api/auth/login/verify', 'POST', {
    code: code(setup.secret, step),
  })

  check(response.status === 200, 'password and valid TOTP create a session')

  check((await request('/api/registries', 'GET')).status === 200, 'completed 2FA grants access')

  check(
    (
      await request('/api/auth/login/verify', 'POST', {
        code: code(setup.secret, step),
      })
    ).status === 400,
    'completed login challenge cannot be replayed'
  )

  await request('/api/auth/logout')
  await request('/api/auth/login', 'POST', credentials)

  check(
    (
      await request('/api/auth/login/verify', 'POST', {
        code: code(setup.secret, step),
      })
    ).status === 401,
    'TOTP cannot be reused in a fresh challenge'
  )

  check(
    (
      await request('/api/auth/login/verify', 'POST', {
        code: recovery[0],
      })
    ).status === 200,
    'one-time recovery code completes sign-in'
  )

  await request('/api/auth/logout')
  await request('/api/auth/login', 'POST', credentials)

  check(
    (
      await request('/api/auth/login/verify', 'POST', {
        code: recovery[0],
      })
    ).status === 401,
    'recovery code cannot be reused'
  )

  async function passkeySignIn(verified: boolean): Promise<Response> {
    const optionsResponse = await request('/api/auth/passkey/options')
    const authentication = await optionsResponse.json()

    check(
      authentication.userVerification === 'required',
      'passkey sign-in requires user verification'
    )

    return request(
      '/api/auth/passkey/verify',
      'POST',
      device.authentication(authentication.challenge, origin, handle, verified)
    )
  }

  check((await passkeySignIn(false)).status === 401, 'unverified passkey cannot bypass 2FA')

  check(
    (await passkeySignIn(true)).status === 200,
    'verified passkey signs in without a TOTP prompt'
  )

  check(
    (await request('/api/registries', 'GET')).status === 200,
    'verified passkey grants API access'
  )

  check(
    (
      await request('/api/account/security/verify', 'POST', {
        password,
      })
    ).status === 401,
    'security changes still require the existing second factor'
  )

  check(
    (
      await request('/api/account/security/verify', 'POST', {
        password,
        code: recovery[1],
      })
    ).status === 200,
    'password and recovery code unlock security changes'
  )

  const otherLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'admin',
      password,
    }),
  })

  const otherCookie = otherLogin.headers.getSetCookie()[0].split(';')[0]

  const grantCookie = [...jar]
    .filter(([name]) => name.includes('registry_security'))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

  check(
    (
      await request(
        '/api/account/passkeys',
        'DELETE',
        { id: device.id },
        `${otherCookie}; ${grantCookie}`
      )
    ).status === 403,
    'security grants cannot be transferred between sessions'
  )

  check(
    (
      await request('/api/account/passkeys', 'DELETE', {
        id: device.id,
      })
    ).status === 200,
    'owner can remove a passkey'
  )

  await request('/api/auth/logout')

  check((await passkeySignIn(true)).status === 401, 'removed passkey cannot sign in')

  await request('/api/auth/login', 'POST', credentials)

  check(
    (
      await request('/api/auth/login/verify', 'POST', {
        code: recovery[2],
      })
    ).status === 200,
    'another recovery code works'
  )

  check(
    (
      await request('/api/account/security/verify', 'POST', {
        password,
        code: recovery[3],
      })
    ).status === 200,
    'fresh verification permits disabling 2FA'
  )

  check(
    (await request('/api/account/totp', 'DELETE')).status === 200,
    'authenticator can be disabled'
  )

  check((await request('/api/registries', 'GET')).status === 401, 'disabling 2FA revokes sessions')

  response = await request('/api/auth/login', 'POST', credentials)

  check(
    (await response.json()).success === true,
    'password-only login is restored after disabling 2FA'
  )

  return assertions
}

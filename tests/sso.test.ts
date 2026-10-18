import assert from 'node:assert/strict'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'

import { GET as callback } from '../src/app/api/auth/sso/[provider]/callback/route'
import { POST as begin } from '../src/app/api/auth/sso/[provider]/route'
import { securityAccounts, securityId } from '../src/lib/auth/accounts'
import { verifyLogin } from '../src/lib/auth/login'
import { issueRequest, readRequest } from '../src/lib/auth/requests'
import { cookieName } from '../src/lib/auth/requests/cookie-name'
import {
  createSession,
  resolveSession,
  sessionCookieName,
  tokenHash,
} from '../src/lib/auth/session'
import { linkUser, ssoConfig, ssoProfile, ssoProviders } from '../src/lib/auth/sso'
import { recoveryHash } from '../src/lib/auth/totp'
import { userFingerprint, users } from '../src/lib/config/users'
import { database } from '../src/lib/database/client'
import { encryptSecret } from '../src/lib/security/crypto'
import { userSchema } from '../src/lib/validation/auth'
import { type Provider, type SsoState } from '../src/types/sso'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-sso-'))
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' }
const ids = ['authentik', 'github', 'google', 'zitadel', 'keycloak'] as const
const configured = [
  {
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    passwordHash: `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`,
  },
  { username: 'member', email: 'member@example.com', role: 'viewer', authProvider: 'sso' },
]

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'a'.repeat(64),
  AUTH_USERS_JSON: JSON.stringify(configured),
  SSO_PROVIDERS_JSON: JSON.stringify(
    ids.map((id) => ({
      id,
      issuer: `https://${id}.example.com`,
      clientId: `console-${id}`,
      clientSecret: 'test-client-secret',
    }))
  ),
})

beforeEach(() => {
  process.env.AUTH_USERS_JSON = JSON.stringify(configured)
  database().prepare('DELETE FROM sso_links').run()
  database().prepare('DELETE FROM auth_requests').run()
  database().prepare('DELETE FROM authenticators').run()
  securityAccounts(users())
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

function token(provider: Provider, claims: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: provider.issuer,
      aud: provider.clientId,
      sub: 'stable-subject',
      iat: now,
      exp: now + 300,
      email: 'member@example.com',
      email_verified: true,
      ...claims,
    })
  ).toString('base64url')
  const value = `${header}.${payload}`

  return `${value}.${createSign('RSA-SHA256').update(value).sign(privateKey).toString('base64url')}`
}

function state(provider: Provider): SsoState {
  return {
    provider: provider.id,
    state: 's'.repeat(43),
    verifier: 'v'.repeat(43),
    nonce: 'n'.repeat(43),
    action: 'login',
    session: '',
    username: '',
    fingerprint: '',
  }
}

function providerFetch(provider: Provider, signed: () => string) {
  return async (raw: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(raw))
    const issuer = provider.issuer!.replace(/\/$/, '')

    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      return Response.json({
        issuer: provider.issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/keys`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      })
    }

    if (url.pathname.endsWith('/keys')) return Response.json({ keys: [publicJwk] })

    if (url.pathname === '/user') return Response.json({ id: 1234 })
    if (url.pathname === '/user/emails') {
      return Response.json([
        { email: 'member@example.com', verified: true, primary: true },
        { email: 'admin@example.com', verified: false, primary: false },
      ])
    }

    assert.ok(url.pathname.endsWith('/token') || url.pathname === '/login/oauth/access_token')

    const form = new URLSearchParams(String(init?.body))

    assert.equal(form.get('code_verifier'), 'v'.repeat(43))
    if (provider.authMethod === 'basic') {
      const header = new Headers(init?.headers).get('authorization')!
      const credentials = Buffer.from(header.slice(6), 'base64')
        .toString()
        .split(':')
        .map((part) => decodeURIComponent(part.replaceAll('+', ' ')))

      assert.ok(header.startsWith('Basic '))
      assert.deepEqual(credentials, [provider.clientId, provider.clientSecret])
      assert.equal(form.get('client_secret'), null)
    } else {
      assert.equal(form.get('client_secret'), 'test-client-secret')
    }

    return Response.json({
      access_token: 'test-access-token',
      token_type: 'Bearer',
      ...(provider.id === 'github' ? {} : { id_token: signed() }),
    })
  }
}

test('all five providers verify identity and match only the configured email and role', async (context) => {
  for (const provider of ssoProviders()) {
    const pending = state(provider)

    context.mock.method(
      globalThis,
      'fetch',
      providerFetch(provider, () =>
        token(provider, {
          nonce: pending.nonce,
          role: 'admin',
        })
      )
    )

    const url = new URL(
      `/api/auth/sso/${provider.id}/callback?code=test&state=${pending.state}`,
      process.env.APP_ORIGIN
    )
    const profile = await ssoProfile(provider, pending, url)
    const user = linkUser(provider.id, profile)

    assert.equal(user.username, 'member')
    assert.equal(user.role, 'viewer')
    assert.equal(user.email, 'member@example.com')
    assert.equal(profile.subject, provider.id === 'github' ? '1234' : 'stable-subject')
  }
})

test('OIDC rejects wrong nonce, audience, signature and unverified email', async (context) => {
  const provider = ssoProviders().find((entry) => entry.id === 'zitadel')!
  const pending = state(provider)
  const url = new URL(`/callback?code=test&state=${pending.state}`, process.env.APP_ORIGIN)

  for (const claims of [
    { nonce: 'wrong' },
    { nonce: pending.nonce, aud: 'another-client' },
    { nonce: pending.nonce, email_verified: false },
    { nonce: pending.nonce, exp: Math.floor(Date.now() / 1000) - 1000 },
  ]) {
    context.mock.method(
      globalThis,
      'fetch',
      providerFetch(provider, () => token(provider, claims))
    )
    await assert.rejects(ssoProfile(provider, pending, url))
  }

  context.mock.method(
    globalThis,
    'fetch',
    providerFetch(provider, () => {
      const signed = token(provider, { nonce: pending.nonce })
      const parts = signed.split('.')

      parts[1] = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()),
          email: 'admin@example.com',
        })
      ).toString('base64url')
      return parts.join('.')
    })
  )
  await assert.rejects(ssoProfile(provider, pending, url))
})

test('OIDC supports path-based issuers and client-secret Basic authentication', async (context) => {
  const base = ssoProviders().find((entry) => entry.id === 'authentik')!

  for (const issuer of [
    'https://auth.example.com/application/o/console/',
    'https://auth.example.com/realms/console',
  ]) {
    const provider = { ...base, issuer, authMethod: 'basic' as const }
    const pending = state(provider)

    context.mock.method(
      globalThis,
      'fetch',
      providerFetch(provider, () => token(provider, { nonce: pending.nonce }))
    )
    const profile = await ssoProfile(
      provider,
      pending,
      new URL(
        `/api/auth/sso/authentik/callback?code=test&state=${pending.state}`,
        process.env.APP_ORIGIN
      )
    )

    assert.equal(profile.issuer, issuer)
    assert.equal(profile.email, 'member@example.com')
  }
})

test('email linking rejects an unconfigured email, a changed subject and a cross-account subject', () => {
  const profile = { issuer: 'https://id.example.com', subject: 'one', email: 'member@example.com' }

  assert.equal(linkUser('keycloak', profile).role, 'viewer')
  assert.throws(() => linkUser('keycloak', { ...profile, subject: 'two' }), /linked account/)
  assert.throws(
    () => linkUser('keycloak', { ...profile, email: 'admin@example.com' }),
    /linked account/
  )
  assert.throws(
    () => linkUser('google', { ...profile, email: 'unknown@example.com' }),
    /not configured/
  )
})

test('normalised unique email preserves identity across a configured username change', () => {
  const user = users().find((entry) => entry.username === 'member')!
  const id = securityId(user)
  const session = createSession(user)

  process.env.AUTH_USERS_JSON = JSON.stringify([
    configured[0],
    { ...configured[1], username: 'renamed' },
  ])
  securityAccounts(users())

  assert.equal(securityId(users()[1]), id)
  assert.equal(resolveSession(session.token), null)
  assert.equal(
    userSchema.parse({ ...configured[1], email: 'Member@Example.com' }).email,
    user.email
  )
  process.env.AUTH_USERS_JSON = JSON.stringify([
    configured[0],
    { ...configured[1], email: 'ADMIN@example.com' },
  ])
  assert.throws(users, /emails must be unique/)
})

test('SSO callback consumes browser state once and creates a viewer session', async (context) => {
  const provider = ssoProviders().find((entry) => entry.id === 'authentik')!
  const pending = state(provider)

  context.mock.method(
    globalThis,
    'fetch',
    providerFetch(provider, () => token(provider, { nonce: pending.nonce }))
  )

  const issued = NextResponse.json({})

  issueRequest(issued, 'sso', null, JSON.stringify(pending))

  const cookie = issued.cookies.get(cookieName('sso'))!
  const url = `${process.env.APP_ORIGIN}/api/auth/sso/authentik/callback?code=test&state=${pending.state}`
  const request = new NextRequest(url, { headers: { Cookie: `${cookie.name}=${cookie.value}` } })
  const response = await callback(request, { params: Promise.resolve({ provider: 'authentik' }) })

  assert.equal(response.status, 303)
  const session = response.cookies.get('__Host-registry_session')

  assert.ok(session)
  assert.equal(resolveSession(session.value)?.role, 'viewer')
  assert.match(response.headers.get('set-cookie')!, /SameSite=lax/i)
  const replay = await callback(request, { params: Promise.resolve({ provider: 'authentik' }) })

  assert.match(replay.headers.get('location')!, /error=sso/)
  assert.equal(replay.cookies.get('__Host-registry_session'), undefined)
})

test('replacing an account UUID clears its old subject binding even when its email is reused', () => {
  const profile = {
    issuer: 'https://id.example.com',
    subject: 'old-subject',
    email: 'member@example.com',
  }
  const old = securityId(linkUser('keycloak', profile))

  process.env.AUTH_USERS_JSON = JSON.stringify([
    configured[0],
    { ...configured[1], username: 'replacement', id: '00000000-0000-4000-8000-000000000003' },
  ])
  securityAccounts(users())

  assert.notEqual(securityId(users()[1]), old)
  assert.equal(database().prepare('SELECT COUNT(*) AS count FROM sso_links').get()!.count, 0)
  assert.equal(linkUser('keycloak', { ...profile, subject: 'new-subject' }).username, 'replacement')
})

test('SSO start validates origin and returns state and PKCE without exposing the client secret', async (context) => {
  const provider = ssoProviders().find((entry) => entry.id === 'keycloak')!

  context.mock.method(
    globalThis,
    'fetch',
    providerFetch(provider, () => token(provider))
  )

  const request = new NextRequest(`${process.env.APP_ORIGIN}/api/auth/sso/keycloak`, {
    method: 'POST',
    headers: { Origin: process.env.APP_ORIGIN!, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const response = await begin(request, { params: Promise.resolve({ provider: 'keycloak' }) })
  const body = await response.json()
  const url = new URL(body.url)

  assert.equal(response.status, 200)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(url.searchParams.get('state'))
  assert.ok(url.searchParams.get('nonce'))
  assert.ok(!JSON.stringify(body).includes('test-client-secret'))
  assert.match(response.headers.get('set-cookie')!, /SameSite=lax/i)
  request.headers.set('Origin', 'https://attacker.example.com')
  assert.equal(
    (await begin(request, { params: Promise.resolve({ provider: 'keycloak' }) })).status,
    403
  )
  assert.ok(await ssoConfig(provider))
})

test('SSO verification remains bound to the original account session', async (context) => {
  const provider = ssoProviders().find((entry) => entry.id === 'google')!
  const user = users()[0]
  const session = createSession(user)
  const pending = {
    ...state(provider),
    action: 'verify' as const,
    username: user.username,
    fingerprint: userFingerprint(user),
    session: 'wrong-session',
  }
  const issued = NextResponse.json({})

  issueRequest(issued, 'sso', user, JSON.stringify(pending))
  context.mock.method(
    globalThis,
    'fetch',
    providerFetch(provider, () =>
      token(provider, {
        nonce: pending.nonce,
        auth_time: Math.floor(Date.now() / 1000),
      })
    )
  )

  const cookie = issued.cookies.get(cookieName('sso'))!
  const response = await callback(
    new NextRequest(
      `${process.env.APP_ORIGIN}/api/auth/sso/google/callback?code=test&state=${pending.state}`,
      { headers: { Cookie: `${cookie.name}=${cookie.value}` } }
    ),
    { params: Promise.resolve({ provider: 'google' }) }
  )

  assert.match(response.headers.get('location')!, /error=sso/)
  assert.equal(resolveSession(session.token)?.username, 'admin')
})

test('SSO sign-in requires the enrolled app factor before creating a session', async (context) => {
  const provider = ssoProviders().find((entry) => entry.id === 'authentik')!
  const user = users()[1]
  const pending = state(provider)
  const issued = NextResponse.json({})
  const code = 'abcd-1234-efgh-5678'

  database()
    .prepare('INSERT INTO authenticators VALUES (?, ?, ?, ?, ?)')
    .run(
      user.username,
      securityId(user),
      encryptSecret('JBSWY3DPEHPK3PXP'),
      -1,
      JSON.stringify([recoveryHash(code)])
    )
  issueRequest(issued, 'sso', null, JSON.stringify(pending))
  context.mock.method(
    globalThis,
    'fetch',
    providerFetch(provider, () => token(provider, { nonce: pending.nonce }))
  )

  const cookie = issued.cookies.get(cookieName('sso'))!
  const response = await callback(
    new NextRequest(
      `${process.env.APP_ORIGIN}/api/auth/sso/authentik/callback?code=test&state=${pending.state}`,
      { headers: { Cookie: `${cookie.name}=${cookie.value}` } }
    ),
    { params: Promise.resolve({ provider: 'authentik' }) }
  )

  assert.match(response.headers.get('location')!, /twoFactor=1/)
  assert.equal(response.cookies.get(sessionCookieName()), undefined)
  const factor = response.cookies.get(cookieName('two-factor'))!
  const request = new Request(process.env.APP_ORIGIN!, {
    headers: { Cookie: `${factor.name}=${factor.value}` },
  })
  const proof = readRequest(request, 'two-factor')

  assert.throws(() => verifyLogin(user, proof, 'wrong'), /Invalid/)
  const signed = verifyLogin(user, proof, code)

  assert.equal(
    resolveSession(signed.cookies.get(sessionCookieName())!.value)?.username,
    user.username
  )
  assert.throws(() => verifyLogin(user, proof, code), /expired/)
})

test('SSO re-verification issues a short-lived proof bound to the original session', async (context) => {
  const provider = ssoProviders().find((entry) => entry.id === 'zitadel')!
  const user = users()[1]
  const session = createSession(user)
  const pending = {
    ...state(provider),
    action: 'verify' as const,
    username: user.username,
    fingerprint: userFingerprint(user),
    session: tokenHash(session.token),
  }
  const issued = NextResponse.json({})

  issueRequest(issued, 'sso', user, JSON.stringify(pending))
  context.mock.method(
    globalThis,
    'fetch',
    providerFetch(provider, () =>
      token(provider, {
        nonce: pending.nonce,
        auth_time: Math.floor(Date.now() / 1000),
      })
    )
  )
  const cookie = issued.cookies.get(cookieName('sso'))!
  const response = await callback(
    new NextRequest(
      `${process.env.APP_ORIGIN}/api/auth/sso/zitadel/callback?code=test&state=${pending.state}`,
      {
        headers: {
          Cookie: `${cookie.name}=${cookie.value}; ${sessionCookieName()}=${session.token}`,
        },
      }
    ),
    { params: Promise.resolve({ provider: 'zitadel' }) }
  )

  assert.equal(new URL(response.headers.get('location')!).pathname, '/account')
  const proof = response.cookies.get(cookieName('sso-verify'))!
  const request = new Request(process.env.APP_ORIGIN!, {
    headers: { Cookie: `${proof.name}=${proof.value}; ${sessionCookieName()}=${session.token}` },
  })

  assert.equal(readRequest(request, 'sso-verify').session_id, pending.session)
  const other = createSession(user)

  request.headers.set(
    'Cookie',
    `${proof.name}=${proof.value}; ${sessionCookieName()}=${other.token}`
  )
  assert.throws(() => readRequest(request, 'sso-verify'), /does not belong/)
})

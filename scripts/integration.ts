import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkAccess } from './fixtures/access'
import {
  checkApplication,
  checkAuthenticationAudit,
  checkLoginLimits,
} from './fixtures/application'
import { checkAuthentication } from './fixtures/authentication'
import { checkBrowsing } from './fixtures/browsing'
import { checkConsole } from './fixtures/console'
import { checkRegistry, checkRegistryDeletion } from './fixtures/registry'
import { checkVisibility } from './fixtures/visibility'
import { startIntegration, waitForInspection } from './helpers/integration'
import { createRequest, signIn } from './helpers/testing'

await test('Production integration', {
  concurrency: false,
}, async (context) => {
  const server = await startIntegration(context)
  const { base, origin, password, fixture } = server
  const anonymous = createRequest({ base, origin })

  await checkAccess({ context, request: anonymous, password })

  const { cookie, setCookie } = await signIn({
    request: anonymous,
    username: 'admin',
    password,
  })

  const { cookie: readerCookie } = await signIn({
    request: anonymous,
    username: 'reader',
    password,
  })

  const request = createRequest({ base, origin, cookie })

  const { cookie: viewerCookie } = await signIn({
    request: anonymous,
    username: 'public-reader',
    password,
  })

  await context.test('session cookies match the origin and retain security attributes', () => {
    const expectedName = server.loopbackHttp ? 'registry_session=' : '__Host-registry_session='
    const secure = /(?:^|;)\s*Secure(?:;|$)/i.test(setCookie)

    assert.ok(setCookie.startsWith(expectedName))
    assert.match(setCookie, /(?:^|;)\s*HttpOnly(?:;|$)/i)
    assert.match(setCookie, /(?:^|;)\s*SameSite=strict(?:;|$)/i)
    assert.equal(secure, !server.loopbackHttp)
  })

  const connectionsResponse = await request('/api/registries')

  assert.equal(connectionsResponse.status, 200, 'authenticated user can list connections')

  const connections = await connectionsResponse.json()

  assert.equal(connections.length, 1, 'initial connection is seeded')

  const id = connections[0].id as string
  const api = `/api/registries/${encodeURIComponent(id)}`

  await context.test('seeded connections do not expose registry credentials', () => {
    const serialized = JSON.stringify(connections)

    assert.ok(!serialized.includes('registry-secret'))
    assert.ok(!serialized.includes(server.encryptedPassword))
  })

  await checkRegistry({ context, request, readerCookie, fixture, api })
  await checkApplication({ context, request, readerCookie, server })
  await checkBrowsing({
    context,
    request,
    readerCookie,
    fixture: server.browsingFixture,
  })
  await checkConsole({
    context,
    request,
    readerCookie,
    fixture: server.consoleFixture,
  })
  await waitForInspection({ server, cookie, id })
  await checkVisibility({
    context,
    request,
    viewerCookie,
    privateApi: api,
    digest: fixture.digest,
    publicOrigin: server.consoleFixture.origin,
  })
  await checkRegistryDeletion({ context, request, api, digest: fixture.digest })

  await context.test('logged-out session cookies cannot be replayed', async () => {
    const logout = await request('/api/auth/logout', {
      method: 'POST',
      body: {},
    })
    const replay = await request('/api/registries')

    assert.equal(logout.status, 200)
    assert.equal(replay.status, 401)
  })

  await context.test('Account security lifecycle', () =>
    checkAuthentication({ base, origin, password })
  )
  await checkAuthenticationAudit({
    context,
    directory: server.directory,
    password,
  })
  await checkLoginLimits({
    context,
    request: anonymous,
    base,
    origin,
    password,
  })
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apiRequest } from '../src/lib/http/client'
import { HttpError } from '../src/lib/http/error'
import { retryDelay } from '../src/lib/http/retry'
import { AppError } from '../src/lib/security/error'
import { createGate } from '../src/lib/security/gate'

test('ordinary API calls do not request upstream refresh and explicit refresh remains available', async (context) => {
  const requests: RequestInit[] = []

  context.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    requests.push(options)
    return Response.json({ ok: true })
  })

  await apiRequest('/api/example')
  await apiRequest('/api/example', { headers: { 'Cache-Control': 'no-cache' } })

  assert.equal(requests[0].cache, undefined)
  assert.equal(new Headers(requests[0].headers).get('cache-control'), null)
  assert.equal(new Headers(requests[1].headers).get('cache-control'), 'no-cache')
})

test('metadata retries only transient statuses, honour Retry-After and stop after three retries', async (context) => {
  for (const status of [429, 503, 504]) {
    context.mock.method(globalThis, 'fetch', async () =>
      Response.json(
        { error: 'Temporarily unavailable.' },
        { status, headers: { 'Retry-After': '10' } }
      )
    )

    await assert.rejects(apiRequest('/api/example'), (error: unknown) => {
      assert.ok(error instanceof HttpError)
      assert.equal(error.status, status)
      assert.equal(retryDelay(error, 1), 10_000)
      assert.equal(retryDelay(error, 3), 10_000)
      assert.equal(retryDelay(error, 4), undefined)
      return true
    })
  }

  for (const status of [400, 401, 403, 404, 409, 502]) {
    assert.equal(retryDelay(new HttpError('Permanent failure.', status), 1), undefined)
  }

  assert.equal(retryDelay(new Error('Unknown failure.'), 1), undefined)
})

test('capacity queues callers, reserves an admin slot and releases each slot once', async () => {
  const enter = createGate(3, 1, 200)
  const first = await enter()
  const second = await enter()
  let waiting = true
  const queued = enter().then((release) => {
    waiting = false
    return release
  })
  const admin = await enter(true)

  assert.equal(waiting, true)
  admin()
  assert.equal(waiting, true)
  first()

  const third = await queued

  assert.equal(waiting, false)
  first()
  second()
  third()
  const release = await enter()

  release()
})

test('capacity waiting expires cleanly and timed-out callers do not consume a slot', async () => {
  const enter = createGate(1, 0, 10)
  const release = await enter()

  await assert.rejects(
    enter(),
    (error: unknown) => error instanceof AppError && error.status === 503
  )
  release()
  const next = await enter()

  next()
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apiRequest } from '../src/lib/http/client'

test('non-JSON API responses include the HTTP status without exposing the response body', async (context) => {
  for (const status of [403, 502, 504]) {
    context.mock.method(
      globalThis,
      'fetch',
      async () => new Response('private proxy diagnostic', { status })
    )

    await assert.rejects(apiRequest('/api/registries/example/image'), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, new RegExp(`HTTP ${status}`))
      assert.doesNotMatch(error.message, /private proxy diagnostic/)

      return true
    })
  }
})

test('valid API errors and JSON success responses keep their existing behavior', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Registry denied access.' }, { status: 502 })
  )

  await assert.rejects(apiRequest('/api/registries/example/image'), /Registry denied access/)

  context.mock.method(globalThis, 'fetch', async () => Response.json({ value: 'ok' }))

  assert.deepEqual(await apiRequest('/api/example'), { value: 'ok' })
})

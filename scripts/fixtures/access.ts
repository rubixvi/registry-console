import assert from 'node:assert/strict'

import { type AccessProps } from './types'

export async function checkAccess({ context, request, password }: AccessProps) {
  await context.test('Unauthenticated access', { concurrency: false }, async (t) => {
    await t.test('APIs reject anonymous requests', async () => {
      const response = await request('/api/registries')

      assert.equal(response.status, 401)
    })

    await t.test('protected pages redirect to login', async () => {
      const response = await request('/')

      assert.equal(response.status, 307)
    })

    await t.test('login rejects cross-origin requests', async () => {
      const response = await request('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password },
        origin: 'https://evil.example',
      })

      assert.equal(response.status, 403)
    })

    await t.test('login rejects incorrect passwords', async () => {
      const response = await request('/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'wrong' },
      })

      assert.equal(response.status, 401)
    })
  })
}

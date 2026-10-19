import assert from 'node:assert/strict'

import { type VisibilityProps } from './types'

export async function checkVisibility({
  context,
  request,
  viewerCookie,
  privateApi,
  digest,
  publicOrigin,
}: VisibilityProps) {
  await context.test(
    'public viewers cannot access private data through catalogue, search, image, scan or page routes',
    async () => {
      const catalogue = await request(`${privateApi}/catalog`, { cookie: viewerCookie })
      const first = await catalogue.json()

      assert.equal(catalogue.status, 200)
      assert.deepEqual(first.items, [])
      assert.ok(first.next)
      assert.ok(!first.next.includes('team'))

      const query = new URLSearchParams({ repository: 'team/api', reference: 'latest' })

      for (const target of [
        `${privateApi}/tags?repository=team%2Fapi`,
        `${privateApi}/browse?repository=team%2Fapi`,
        `${privateApi}/image?${query}`,
        `${privateApi}/metadata?${query}`,
        `${privateApi}/scan?repository=team%2Fapi&digest=${encodeURIComponent(digest)}`,
        `${privateApi.replace('/api', '')}?${query}`,
      ]) {
        const response = await request(target, { cookie: viewerCookie })

        assert.equal(response.status, 404, target)
        await response.body?.cancel()
      }

      const result = await request(`/api/search?registry=${privateApi.split('/').at(-1)}`, {
        cookie: viewerCookie,
      })

      assert.equal(result.status, 200)
      assert.deepEqual((await result.json()).results, [])
    }
  )

  await context.test(
    'viewers can inspect public images but cannot change connections or start scans',
    async () => {
      const created = await request('/api/registries', {
        method: 'POST',
        body: {
          name: 'Public visibility fixture',
          url: publicOrigin,
          username: '',
          password: '',
          pullUrl: '',
          readOnly: false,
        },
      })

      assert.equal(created.status, 201)
      const { id } = await created.json()
      const api = `/api/registries/${id}`

      try {
        const catalogue = await request(`${api}/catalog`, { cookie: viewerCookie })

        assert.equal(catalogue.status, 200)
        assert.deepEqual((await catalogue.json()).items, ['team/app'])

        const query = new URLSearchParams({ repository: 'team/app', reference: 'protected' })
        const image = await request(`${api}/image?${query}`, { cookie: viewerCookie })

        assert.equal(image.status, 200)
        assert.ok((await image.json()).digest)
        const changed = await request(api, { method: 'DELETE', cookie: viewerCookie, body: {} })
        const scan = await request(`${api}/scan`, {
          method: 'POST',
          cookie: viewerCookie,
          body: {},
        })

        assert.equal(changed.status, 403)
        assert.equal(scan.status, 403)
      } finally {
        assert.equal((await request(api, { method: 'DELETE', body: {} })).status, 200)
      }
    }
  )
}

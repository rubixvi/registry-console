import assert from 'node:assert/strict'

import { type BrowsingProps } from './types'

export async function checkBrowsing({ context, request, readerCookie, fixture }: BrowsingProps) {
  await context.test('Browsing', { concurrency: false }, async (t) => {
    const input = {
      name: 'Browsing checks',
      url: fixture.origin,
      pullUrl: '',
      username: '',
      password: '',
      readOnly: false,
    }

    const created = await request('/api/registries', {
      method: 'POST',
      body: input,
    })

    assert.equal(created.status, 201, 'browsing connection can be created')

    const { id } = await created.json()
    const api = `/api/registries/${id}`

    t.after(async () => {
      const response = await request(api, { method: 'DELETE', body: {} })

      assert.equal(response.status, 200, 'browsing test connection is removed')
    })

    await t.test('complete listings require authentication', async () => {
      const response = await request(`${api}/browse`, { cookie: '' })

      assert.equal(response.status, 401)
    })

    await t.test('complete listings validate query parameters', async () => {
      const invalidRepository = await request(`${api}/browse?repository=..%2Fprivate`)
      const unknownParameter = await request(`${api}/browse?unknown=true`)

      assert.equal(invalidRepository.status, 400, 'repository names are validated')
      assert.equal(unknownParameter.status, 400, 'unsupported parameters are rejected')
    })

    await t.test('members receive the complete paginated catalogue', async () => {
      const response = await request(`${api}/browse`, {
        cookie: readerCookie,
      })
      const catalogue = await response.json()

      assert.equal(catalogue.items.length, 210)
      assert.ok(catalogue.items.includes('team/backend/api'))
      assert.equal(response.headers.get('cache-control'), 'no-store')
    })

    await t.test('server cache avoids repeated catalogue requests', async () => {
      const initial = await request(`${api}/browse`)

      assert.equal(initial.status, 200)

      const before = fixture.requests.get('/v2/_catalog')

      assert.ok(before && before > 0, 'catalogue has been fetched from the upstream registry')

      const repeated = await request(`${api}/browse`)

      assert.equal(repeated.status, 200)
      assert.equal(fixture.requests.get('/v2/_catalog'), before)
    })

    await t.test('all upstream tag pages are available for sorting', async () => {
      const response = await request(`${api}/browse?repository=team%2Fapp`)
      const tags = await response.json()

      assert.equal(tags.items.length, 206)
      assert.ok(tags.items.includes('v205'))
    })

    await t.test('explicit refresh bypasses the cached catalogue', async () => {
      const initial = await request(`${api}/browse`)

      assert.equal(initial.status, 200)
      fixture.state.repositories.push('fresh/repository')

      const cachedResponse = await request(`${api}/browse`)
      const cached = await cachedResponse.json()

      assert.equal(cached.items.length, 210, 'cached catalogue retains its bounded lifetime')

      const freshResponse = await request(`${api}/browse`, { fresh: true })
      const fresh = await freshResponse.json()

      assert.equal(fresh.items.length, 211, 'refresh retrieves fresh upstream pages')
    })

    await t.test('only configured custom labels are returned as text', async () => {
      const response = await request(`${api}/image?repository=team%2Fapp&reference=v1`)
      const image = await response.json()

      assert.ok(
        image.labels.some(
          (label: { name: string; value: string }) =>
            label.name === 'com.example.team' && label.value === '<script>example</script>'
        )
      )
      assert.ok(
        !image.labels.some((label: { name: string }) => label.name === 'com.example.hidden')
      )
    })

    await t.test('selection controls retain read-only protection', async (t) => {
      t.after(async () => {
        const response = await request(api, { method: 'PUT', body: input })

        assert.equal(response.status, 200, 'connection can be made writable')
      })

      const updated = await request(api, {
        method: 'PUT',
        body: { ...input, readOnly: true },
      })

      assert.equal(updated.status, 200, 'connection can be made read-only')

      const response = await request(`${api}/bulk`, {
        method: 'POST',
        body: { repository: 'team/app', tags: ['v1'] },
      })

      assert.equal(response.status, 403)
    })

    await t.test('bulk deletion deduplicates aliases and invalidates cached data', async () => {
      const primedTags = await request(`${api}/browse?repository=team%2Fapp`)
      const primedImage = await request(`${api}/image?repository=team%2Fapp&reference=v1`)

      assert.equal(primedTags.status, 200)
      assert.equal(primedImage.status, 200)

      const preview = await request(`${api}/bulk`, {
        method: 'POST',
        body: { repository: 'team/app', tags: ['v1', 'v2'] },
      })

      assert.equal(preview.status, 200)

      const plan = await preview.json()

      assert.equal(plan.entries.length, 1, 'selected aliases share one manifest')

      const deleted = await request(`${api}/bulk`, {
        method: 'DELETE',
        body: { planId: plan.id, confirmation: 'team/app' },
      })

      assert.equal(deleted.status, 200, 'confirmed bulk deletion succeeds')

      const remainingResponse = await request(`${api}/browse?repository=team%2Fapp`)
      const remaining = await remainingResponse.json()
      const image = await request(`${api}/image?repository=team%2Fapp&reference=v1`)

      assert.equal(remaining.items.length, 0, 'deletion invalidates cached tag pages')
      assert.equal(image.status, 404, 'deletion invalidates cached image manifests')
    })
  })
}

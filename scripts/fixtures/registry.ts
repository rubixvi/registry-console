import assert from 'node:assert/strict'

import { type DeletionProps, type RegistryProps } from './types'

export async function checkRegistry({
  context,
  request,
  readerCookie,
  fixture,
  api,
}: RegistryProps) {
  await context.test('Registry API', { concurrency: false }, async (t) => {
    const deletion = {
      repository: 'team/api',
      digest: fixture.digest,
      confirmation: 'team/api',
    }

    await t.test('Bearer authentication connects to the registry', async () => {
      const response = await request(`${api}/status`)

      assert.equal(response.status, 200)
    })

    await t.test('catalogue pagination reuses a scoped Bearer token', async () => {
      const firstResponse = await request(`${api}/catalog`)
      const first = await firstResponse.json()
      const before = fixture.state.tokens.filter(
        (token) => token.scope === 'registry:catalog:*'
      ).length

      assert.equal(first.items[0], 'team/api')
      assert.equal(first.next, 'team/api')

      const secondResponse = await request(`${api}/catalog?last=team%2Fapi`)
      const second = await secondResponse.json()
      const after = fixture.state.tokens.filter(
        (token) => token.scope === 'registry:catalog:*'
      ).length

      assert.equal(second.items[0], 'worker')
      assert.ok(!second.next)
      assert.equal(after, before)
    })

    await t.test(
      'tags, verified image details and multi-platform indexes are available',
      async () => {
        const tagsResponse = await request(`${api}/tags?repository=team%2Fapi`)
        const tags = await tagsResponse.json()
        const imageResponse = await request(`${api}/image?repository=team%2Fapi&reference=latest`)
        const image = await imageResponse.json()
        const indexResponse = await request(`${api}/image?repository=team%2Fapi&reference=multi`)
        const index = await indexResponse.json()

        assert.ok(tags.items.includes('latest'))
        assert.equal(image.verified, true)
        assert.equal(image.digest, fixture.digest)
        assert.equal(image.config.architecture, 'amd64')
        assert.equal(index.platforms[0], 'linux/amd64')
      }
    )

    await t.test('tampered manifests and upstream redirects are rejected', async () => {
      const tampered = await request(`${api}/image?repository=bad&reference=latest`)
      const redirected = await request(`${api}/image?repository=redirect&reference=latest`)

      assert.equal(tampered.status, 502)
      assert.equal(redirected.status, 502)
    })

    await t.test('token challenges cannot change the realm or escalate scope', async () => {
      fixture.state.mode = 'evil-token'

      try {
        const response = await request(`${api}/status`)

        assert.equal(response.status, 502, 'unapproved token realm is blocked')
      } finally {
        fixture.state.mode = 'normal'
      }

      assert.ok(fixture.state.tokens.every((token) => !token.scope.includes('evil')))
    })

    await t.test('members can browse but cannot delete images', async () => {
      const catalogue = await request(`${api}/catalog`, {
        cookie: readerCookie,
      })

      const deleted = await request(`${api}/image`, {
        method: 'DELETE',
        body: deletion,
        cookie: readerCookie,
      })

      assert.equal(catalogue.status, 200)
      assert.equal(deleted.status, 403)
    })

    await t.test('deletion requires a trusted origin and typed confirmation', async () => {
      const foreign = await request(`${api}/image`, {
        method: 'DELETE',
        body: deletion,
        origin: 'https://evil.example',
      })

      const invalid = await request(`${api}/image`, {
        method: 'DELETE',
        body: { ...deletion, confirmation: 'wrong' },
      })

      assert.equal(foreign.status, 403)
      assert.equal(invalid.status, 400)
    })

    const update = {
      name: 'Production',
      url: fixture.origin,
      username: 'robot',
      password: 'registry-secret',
      readOnly: true,
    }

    await t.test('read-only connections prevent administrator deletion', async (t) => {
      t.after(async () => {
        const response = await request(api, {
          method: 'PUT',
          body: { ...update, readOnly: false },
        })

        assert.equal(response.status, 200, 'connection can be made writable')
      })

      const updated = await request(api, { method: 'PUT', body: update })
      const deleted = await request(`${api}/image`, {
        method: 'DELETE',
        body: deletion,
      })

      assert.equal(updated.status, 200, 'connection can be updated')
      assert.equal(deleted.status, 403)
    })

    await t.test('connections reject unapproved origins', async () => {
      const response = await request('/api/registries', {
        method: 'POST',
        body: { ...update, url: 'https://evil.example' },
      })

      assert.equal(response.status, 400)
    })
  })
}

export async function checkRegistryDeletion({ context, request, api, digest }: DeletionProps) {
  await context.test('Confirmed manifest deletion removes every alias', async (t) => {
    t.after(async () => {
      const response = await request(api, { method: 'DELETE', body: {} })

      assert.equal(response.status, 200, 'connection can be removed')
    })

    const deleted = await request(`${api}/image`, {
      method: 'DELETE',
      body: { repository: 'team/api', digest, confirmation: 'team/api' },
    })

    assert.equal(deleted.status, 200)

    const response = await request(`${api}/tags?repository=team%2Fapi`)
    const remaining = await response.json()

    assert.ok(!remaining.items.includes('latest'))
    assert.ok(!remaining.items.includes('stable'))
  })
}

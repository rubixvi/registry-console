import assert from 'node:assert/strict'

import { type ConsoleProps } from './types'

export async function checkConsole({ context, request, readerCookie, fixture }: ConsoleProps) {
  await context.test('Console features', { concurrency: false }, async (t) => {
    await t.test('audit access is restricted to admins', async () => {
      const anonymous = await request('/api/audit', { cookie: '' })
      const viewer = await request('/api/audit', { cookie: readerCookie })
      const viewerPage = await request('/audit', { cookie: readerCookie })
      const adminPage = await request('/audit')

      assert.equal(anonymous.status, 401)
      assert.equal(viewer.status, 403)
      assert.equal(viewerPage.status, 307)
      assert.equal(adminPage.status, 200)
    })

    await t.test('audit cursors and date ranges are validated', async () => {
      const cursor = await request('/api/audit?before=invalid')
      const dates = await request('/api/audit?from=2026-10-02&to=2026-10-01')

      assert.equal(cursor.status, 400)
      assert.equal(dates.status, 400)
    })

    const input = {
      name: 'Feature registry',
      url: fixture.origin,
      username: '',
      password: '',
      pullUrl: '',
      readOnly: false,
    }

    const created = await request('/api/registries', {
      method: 'POST',
      body: input,
    })

    assert.equal(created.status, 201, 'additional registry connection can be created')

    const { id } = await created.json()
    const api = `/api/registries/${id}`
    const repository = 'team/app'
    const query = new URLSearchParams({ repository, reference: 'latest' })
    const selection = {
      repository,
      tags: ['latest', 'stable', 'worker', 'protected'],
    }

    t.after(async () => {
      const response = await request(api, { method: 'DELETE', body: {} })

      assert.equal(response.status, 200, 'feature test connection can be removed')
    })

    await t.test('image views expose the default public pull URL', async () => {
      const response = await request(`/registries/${id}?${query}`)
      const html = await response.text()
      const addresses = [...html.matchAll(/https?:\/\/[a-zA-Z0-9.:-]+/g)]

      assert.ok(
        addresses.some(
          ([address]) => new URL(address).origin === 'https://pull-default.example.com'
        )
      )
      assert.ok(html.includes('href="/audit"'), 'admin sidebar includes audit navigation')
    })

    await t.test('member navigation hides administrator pages', async () => {
      const response = await request('/', { cookie: readerCookie })
      const html = await response.text()

      assert.ok(!html.includes('href="/audit"'))
      assert.ok(!html.includes('href="/settings"'))
    })

    await t.test('public pull URLs are normalized without changing the API origin', async () => {
      const updated = await request(api, {
        method: 'PUT',
        body: { ...input, pullUrl: 'https://public-registry.example.com/' },
      })

      assert.equal(updated.status, 200)

      const response = await request('/api/registries')
      const connections = await response.json()
      const stored = connections.find((connection: { id: string }) => connection.id === id)

      assert.equal(stored.pullUrl, 'https://public-registry.example.com')
      assert.equal(stored.url, fixture.origin)

      const invalid = await request(api, {
        method: 'PUT',
        body: { ...input, pullUrl: 'https://user:secret@example.com' },
      })

      assert.equal(invalid.status, 400, 'credential-bearing public URLs are rejected')
    })

    await t.test('image history is newest first and identifies metadata steps', async () => {
      const response = await request(`${api}/image?${query}`)
      const image = await response.json()

      assert.equal(image.history.length, 3)
      assert.equal(image.history[0].command, 'RUN build')
      assert.equal(image.history[1].emptyLayer, true)
      assert.equal(image.history[1].size, null)
    })

    await t.test('members can search repositories by name and architecture', async () => {
      const response = await request(`/api/search?registry=${id}&query=app&architecture=amd64`, {
        cookie: readerCookie,
      })

      const search = await response.json()

      assert.equal(search.results.length, 1)
      assert.equal(search.results[0].repository, repository)
    })

    await t.test('architecture filtering excludes unsupported tag platforms', async () => {
      const response = await request(`${api}/browse?repository=${repository}&architecture=arm64`)
      const filtered = await response.json()

      assert.equal(filtered.items.length, 0)
    })

    await t.test(
      'scanning requires opt-in, administrator access and a trusted origin',
      async () => {
        const digest = fixture.tags.get('app')!
        const scanQuery = new URLSearchParams({ repository, digest })
        const status = await request(`${api}/scan?${scanQuery}`)
        const scan = await status.json()
        const body = { repository, digest }

        assert.equal(scan.enabled, false, 'scanning is disabled unless explicitly enabled')

        const viewer = await request(`${api}/scan`, {
          method: 'POST',
          body,
          cookie: readerCookie,
        })

        const admin = await request(`${api}/scan`, { method: 'POST', body })
        const foreign = await request(`${api}/scan`, {
          method: 'POST',
          body,
          origin: 'https://evil.example',
        })

        assert.equal(viewer.status, 403, 'members cannot start scans')
        assert.equal(admin.status, 409, 'admins cannot bypass scanner opt-in')
        assert.equal(foreign.status, 403, 'scan starts reject cross-origin requests')
      }
    )

    await t.test('bulk deletion validates permissions, origins and selected tags', async () => {
      const viewerPreview = await request(`${api}/bulk`, {
        method: 'POST',
        body: selection,
        cookie: readerCookie,
      })

      const viewerDelete = await request(`${api}/bulk`, {
        method: 'DELETE',
        body: {},
        cookie: readerCookie,
      })

      const foreign = await request(`${api}/bulk`, {
        method: 'POST',
        body: selection,
        origin: 'https://evil.example',
      })

      const duplicates = await request(`${api}/bulk`, {
        method: 'POST',
        body: { repository, tags: ['latest', 'latest'] },
      })

      assert.equal(viewerPreview.status, 403)
      assert.equal(viewerDelete.status, 403)
      assert.equal(foreign.status, 403)
      assert.equal(duplicates.status, 400)
    })

    await t.test('read-only connections reject bulk previews', async (t) => {
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
        body: selection,
      })

      assert.equal(response.status, 403)
    })

    await t.test('bulk deletion deduplicates digests and reports partial failures', async () => {
      const preview = await request(`${api}/bulk`, {
        method: 'POST',
        body: selection,
      })

      assert.equal(preview.status, 200)

      const plan = await preview.json()

      assert.equal(plan.entries.length, 3, 'shared manifest digests are deduplicated')
      assert.equal(fixture.deletes.size, 0, 'preview does not delete registry content')

      const invalid = await request(`${api}/bulk`, {
        method: 'DELETE',
        body: { planId: plan.id, confirmation: 'wrong' },
      })

      assert.equal(invalid.status, 400, 'repository confirmation is required')

      const deleted = await request(`${api}/bulk`, {
        method: 'DELETE',
        body: { planId: plan.id, confirmation: repository },
      })

      assert.equal(deleted.status, 200)

      const result = await deleted.json()

      assert.equal(result.deleted, 2)
      assert.equal(result.failed, 1)
      assert.equal(
        fixture.deletes.get(fixture.tags.get('app')!),
        1,
        'shared digest is deleted once'
      )

      const replay = await request(`${api}/bulk`, {
        method: 'DELETE',
        body: { planId: plan.id, confirmation: repository },
      })

      assert.equal(replay.status, 400, 'deletion plans cannot be replayed')

      const remainingResponse = await request(`${api}/tags?repository=team%2Fapp`)
      const remaining = await remainingResponse.json()

      assert.deepEqual(remaining.items, ['protected'], 'only failed deletions remain')
    })

    await t.test('bulk outcomes appear in the administrator audit log', async () => {
      const response = await request('/api/audit?action=manifest.bulk.complete')
      const log = await response.json()

      assert.ok(
        log.items.some(
          (entry: { actor: string; target: string }) =>
            entry.actor === 'admin' && JSON.parse(entry.target).failed === 1
        )
      )
    })

    await t.test('audit pagination has stable descending cursors', async () => {
      const firstResponse = await request('/api/audit?n=2')
      const first = await firstResponse.json()
      const secondResponse = await request(`/api/audit?n=2&before=${first.next}`)
      const second = await secondResponse.json()

      assert.equal(first.items.length, 2)
      assert.equal(second.items.length, 2)
      assert.ok(first.items[1].id > second.items[0].id)
    })

    await t.test('audit searches handle wildcard and quote characters', async () => {
      const response = await request('/api/audit?query=%25_%27')

      assert.equal(response.status, 200)
    })
  })
}

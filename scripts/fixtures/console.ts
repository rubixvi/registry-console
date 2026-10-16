import assert from 'node:assert/strict'

import { type mockConsoleRegistry } from './console-registry'

type Input = {
  base: string
  origin: string
  cookie: string
  readerCookie: string
  fixture: Awaited<ReturnType<typeof mockConsoleRegistry>>
}

export async function consoleChecks({
  base,
  origin,
  cookie,
  readerCookie,
  fixture,
}: Input): Promise<number> {
  let assertions = 0

  function check(value: unknown, message: string): void {
    assert.ok(value, message)
    assertions++
  }

  async function request(
    url: string,
    method = 'GET',
    body?: unknown,
    session = cookie,
    source = origin
  ): Promise<Response> {
    return fetch(`${base}${url}`, {
      method,
      headers: { Origin: source, 'Content-Type': 'application/json', Cookie: session },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    })
  }

  check(
    (await request('/api/audit', 'GET', undefined, '')).status === 401,
    'audit API requires authentication'
  )
  check(
    (await request('/api/audit', 'GET', undefined, readerCookie)).status === 403,
    'viewers cannot read the audit API'
  )
  check(
    (await request('/audit', 'GET', undefined, readerCookie)).status === 307,
    'viewers cannot open the audit page'
  )
  check((await request('/audit')).status === 200, 'administrators can open the audit page')
  check((await request('/api/audit?before=invalid')).status === 400, 'audit cursors are validated')
  check(
    (await request('/api/audit?from=2026-10-02&to=2026-10-01')).status === 400,
    'audit date ranges are validated'
  )

  const input = {
    name: 'Feature registry',
    url: fixture.origin,
    username: '',
    password: '',
    pullUrl: '',
    readOnly: false,
  }
  let response = await request('/api/registries', 'POST', input)

  check(response.status === 201, 'additional registry connection can be created')

  const { id } = await response.json()
  const api = `/api/registries/${id}`
  const page = `/registries/${id}`
  const repository = 'team/app'
  const query = new URLSearchParams({ repository, reference: 'latest' })
  const defaultHtml = await (await request(`${page}?${query}`)).text()

  check(
    [...defaultHtml.matchAll(/https?:\/\/[a-zA-Z0-9.:-]+/g)].some(
      ([address]) => new URL(address).origin === 'https://pull-default.example.com'
    ),
    'global public pull URL is available to the image view'
  )
  check(defaultHtml.includes('href="/audit"'), 'admin sidebar includes audit navigation')

  const viewerHtml = await (await request('/', 'GET', undefined, readerCookie)).text()

  check(!viewerHtml.includes('href="/audit"'), 'viewer navigation hides the audit page')
  check(!viewerHtml.includes('href="/settings"'), 'viewer navigation hides administrator settings')

  response = await request(api, 'PUT', {
    ...input,
    pullUrl: 'https://public-registry.example.com/',
  })
  check(response.status === 200, 'per-registry public pull URL can be configured')

  const connections = await (await request('/api/registries')).json()
  const stored = connections.find((connection: { id: string }) => connection.id === id)

  check(
    stored.pullUrl === 'https://public-registry.example.com',
    'public pull URL is normalized and persists'
  )
  check(stored.url === fixture.origin, 'public pull URL does not change the API connection origin')
  check(
    (await request(api, 'PUT', { ...input, pullUrl: 'https://user:secret@example.com' })).status ===
      400,
    'credential-bearing public URLs are rejected'
  )

  const image = await (await request(`${api}/image?${query}`)).json()

  check(
    image.history.length === 3 && image.history[0].command === 'RUN build',
    'image API exposes readable history newest first'
  )
  check(
    image.history[1].emptyLayer && image.history[1].size === null,
    'metadata steps do not consume filesystem layers'
  )

  const search = await (
    await request(
      `/api/search?registry=${id}&query=app&architecture=amd64`,
      'GET',
      undefined,
      readerCookie
    )
  ).json()

  check(
    search.results.length === 1 && search.results[0].repository === repository,
    'viewers can search repositories by name and architecture'
  )

  const filtered = await (
    await request(`${api}/browse?repository=${repository}&architecture=arm64`)
  ).json()

  check(filtered.items.length === 0, 'architecture filtering excludes unsupported tag platforms')

  const scanQuery = new URLSearchParams({ repository, digest: image.digest })
  const scan = await (await request(`${api}/scan?${scanQuery}`)).json()

  check(scan.enabled === false, 'scanning is disabled unless explicitly enabled')
  check(
    (await request(`${api}/scan`, 'POST', { repository, digest: image.digest }, readerCookie))
      .status === 403,
    'viewers cannot start vulnerability scans'
  )
  check(
    (await request(`${api}/scan`, 'POST', { repository, digest: image.digest })).status === 409,
    'administrators cannot bypass the scanner opt-in'
  )
  check(
    (
      await request(
        `${api}/scan`,
        'POST',
        { repository, digest: image.digest },
        cookie,
        'https://evil.example'
      )
    ).status === 403,
    'scan starts reject cross-origin requests'
  )

  const preview = { repository, tags: ['latest', 'stable', 'worker', 'protected'] }

  check(
    (await request(`${api}/bulk`, 'POST', preview, readerCookie)).status === 403,
    'viewers cannot prepare bulk deletion'
  )
  check(
    (await request(`${api}/bulk`, 'DELETE', {}, readerCookie)).status === 403,
    'viewers cannot execute bulk deletion'
  )
  check(
    (await request(`${api}/bulk`, 'POST', preview, cookie, 'https://evil.example')).status === 403,
    'bulk deletion rejects cross-origin requests'
  )
  check(
    (await request(`${api}/bulk`, 'POST', { repository, tags: ['latest', 'latest'] })).status ===
      400,
    'duplicate selected tags are rejected'
  )

  await request(api, 'PUT', { ...input, readOnly: true })
  check(
    (await request(`${api}/bulk`, 'POST', preview)).status === 403,
    'read-only connections reject bulk previews'
  )
  await request(api, 'PUT', input)
  response = await request(`${api}/bulk`, 'POST', preview)
  check(response.status === 200, 'administrator can prepare bulk deletion')

  const plan = await response.json()

  check(plan.entries.length === 3, 'shared manifest digests are deduplicated in the preview')
  check(fixture.deletes.size === 0, 'preview does not delete any registry content')
  check(
    (await request(`${api}/bulk`, 'DELETE', { planId: plan.id, confirmation: 'wrong' })).status ===
      400,
    'repository confirmation is required'
  )
  response = await request(`${api}/bulk`, 'DELETE', { planId: plan.id, confirmation: repository })
  check(response.status === 200, 'confirmed bulk deletion returns individual outcomes')

  const result = await response.json()

  check(result.deleted === 2 && result.failed === 1, 'partial deletion failures remain visible')
  check(fixture.deletes.get(fixture.tags.get('app')!) === 1, 'a shared digest is deleted only once')
  check(
    (await request(`${api}/bulk`, 'DELETE', { planId: plan.id, confirmation: repository }))
      .status === 400,
    'deletion plans cannot be replayed'
  )

  const remaining = await (await request(`${api}/tags?repository=team%2Fapp`)).json()

  check(
    remaining.items.length === 1 && remaining.items[0] === 'protected',
    'only failed deletions remain in the tag list'
  )

  const log = await (await request('/api/audit?action=manifest.bulk.complete')).json()

  check(
    log.items.some(
      (entry: { actor: string; target: string }) =>
        entry.actor === 'admin' && JSON.parse(entry.target).failed === 1
    ),
    'bulk outcomes are visible in the administrator audit log'
  )

  const first = await (await request('/api/audit?n=2')).json()
  const second = await (await request(`/api/audit?n=2&before=${first.next}`)).json()

  check(
    first.items.length === 2 && second.items.length === 2 && first.items[1].id > second.items[0].id,
    'audit pagination has stable descending cursors'
  )
  check(
    (await request('/api/audit?query=%25_%27')).status === 200,
    'audit searches safely handle wildcard and quote characters'
  )
  check((await request(api, 'DELETE', {})).status === 200, 'feature test connection can be removed')

  return assertions
}

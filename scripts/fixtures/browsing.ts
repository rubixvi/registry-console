import { createCheck, createRequest } from '../helpers/testing'
import { type mockBrowsing } from './mock-browsing'

type Props = {
  base: string
  origin: string
  cookie: string
  readerCookie: string
  fixture: Awaited<ReturnType<typeof mockBrowsing>>
}

export async function checkBrowsing({
  base,
  origin,
  cookie,
  readerCookie,
  fixture,
}: Props): Promise<number> {
  const check = createCheck()

  const request = createRequest({ base, origin, cookie })

  const input = {
    name: 'Browsing checks',
    url: fixture.origin,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: false,
  }

  const created = await request('/api/registries', { method: 'POST', body: input })

  check(created.status === 201, 'browsing connection can be created')

  const { id } = await created.json()

  const api = `/api/registries/${id}`

  check(
    (await request(`${api}/browse`, { cookie: '' })).status === 401,
    'complete listings require authentication'
  )

  check(
    (await request(`${api}/browse?repository=..%2Fprivate`)).status === 400,
    'complete listings validate repository names'
  )

  check(
    (await request(`${api}/browse?unknown=true`)).status === 400,
    'complete listings reject unsupported parameters'
  )

  const response = await request(`${api}/browse`, { cookie: readerCookie })

  const catalogue = await response.json()

  check(
    catalogue.items.length === 210 && catalogue.items.includes('team/backend/api'),
    'viewers receive the complete paginated catalogue'
  )

  check(
    response.headers.get('cache-control') === 'no-store',
    'authenticated API responses remain uncached by browsers'
  )

  const catalogueRequests = fixture.requests.get('/v2/_catalog')

  await request(`${api}/browse`)

  check(
    fixture.requests.get('/v2/_catalog') === catalogueRequests,
    'server cache avoids repeated registry catalogue requests'
  )

  const tags = await (await request(`${api}/browse?repository=team%2Fapp`)).json()

  check(
    tags.items.length === 206 && tags.items.includes('v205'),
    'tags from every upstream page are available for sorting'
  )

  fixture.state.repositories.push('fresh/repository')

  const cached = await (await request(`${api}/browse`)).json()

  check(cached.items.length === 210, 'mutable cached catalogue retains its bounded lifetime')

  const freshResponse = await request(`${api}/browse`, { fresh: true })

  const fresh = await freshResponse.json()

  check(
    fresh.items.length === 211,
    `explicit refresh retrieves fresh upstream pages (received ${fresh.items?.length ?? JSON.stringify(fresh)})`
  )

  const image = await (await request(`${api}/image?repository=team%2Fapp&reference=v1`)).json()

  check(
    image.labels.some(
      (label: { name: string; value: string }) =>
        label.name === 'com.example.team' && label.value === '<script>example</script>'
    ),
    'configured history labels are returned as text'
  )

  check(
    !image.labels.some((label: { name: string }) => label.name === 'com.example.hidden'),
    'unconfigured custom labels are omitted'
  )

  await request(api, { method: 'PUT', body: { ...input, readOnly: true } })

  check(
    (
      await request(`${api}/bulk`, {
        method: 'POST',
        body: { repository: 'team/app', tags: ['v1'] },
      })
    ).status === 403,
    'new selection controls retain read-only protection'
  )

  await request(api, { method: 'PUT', body: input })

  const preview = await request(`${api}/bulk`, {
    method: 'POST',
    body: {
      repository: 'team/app',
      tags: ['v1', 'v2'],
    },
  })

  const plan = await preview.json()

  check(
    preview.status === 200 && plan.entries.length === 1,
    'bulk previews still deduplicate selected aliases'
  )

  check(
    (
      await request(`${api}/bulk`, {
        method: 'DELETE',
        body: { planId: plan.id, confirmation: 'team/app' },
      })
    ).status === 200,
    'confirmed bulk deletion succeeds'
  )

  const remaining = await (await request(`${api}/browse?repository=team%2Fapp`)).json()

  check(remaining.items.length === 0, 'deletion invalidates cached tag pages')

  check(
    (await request(`${api}/image?repository=team%2Fapp&reference=v1`)).status === 404,
    'deletion invalidates cached image manifests'
  )

  check(
    (await request(api, { method: 'DELETE', body: {} })).status === 200,
    'browsing test connection is removed'
  )

  return check.count
}

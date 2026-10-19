import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { startIntegration } from './helpers/integration'
import { createRequest, signIn } from './helpers/testing'

await test('Automatic vulnerability scanning in the production server', async (context) => {
  if (process.platform === 'win32') {
    context.skip(
      'The production smoke test uses a POSIX executable fixture. Unit fixtures support Windows.'
    )
    return
  }

  const directory = mkdtempSync(path.join(tmpdir(), 'registry-scan-integration-'))
  const executable = path.join(directory, 'scanner')
  const capture = path.join(directory, 'scans.jsonl')
  const previous = {
    enabled: process.env.TRIVY_ENABLED,
    path: process.env.TRIVY_PATH,
    budget: process.env.TRIVY_SCANS_PER_HOUR,
  }

  context.after(() => {
    if (previous.enabled === undefined) delete process.env.TRIVY_ENABLED
    else process.env.TRIVY_ENABLED = previous.enabled

    if (previous.path === undefined) delete process.env.TRIVY_PATH
    else process.env.TRIVY_PATH = previous.path

    if (previous.budget === undefined) delete process.env.TRIVY_SCANS_PER_HOUR
    else process.env.TRIVY_SCANS_PER_HOUR = previous.budget

    rmSync(directory, { recursive: true, force: true })
  })

  writeFileSync(
    executable,
    `#!${process.execPath}
  const fs = require('node:fs')
  
  fs.appendFileSync(
    ${JSON.stringify(capture)},
    JSON.stringify(process.argv.at(-1)) + '\\n'
  )
  
  console.log(
    JSON.stringify({
      SchemaVersion: 2,
      Results: [],
    })
  )
  `,
    { mode: 0o700 }
  )

  process.env.TRIVY_ENABLED = 'true'
  process.env.TRIVY_SCANS_PER_HOUR = '4'
  process.env.TRIVY_PATH = executable

  const server = await startIntegration(context)
  const anonymous = createRequest({ base: server.base, origin: server.origin })
  const { cookie } = await signIn({
    request: anonymous,
    username: 'admin',
    password: server.password,
  })

  const reader = await signIn({
    request: anonymous,
    username: 'reader',
    password: server.password,
  })

  const request = createRequest({
    base: server.base,
    origin: server.origin,
    cookie,
  })

  const response = await request('/api/registries')
  const connections = await response.json()
  const id = connections[0].id
  const endpoint = `/api/registries/${encodeURIComponent(id)}/scan`
  const query = new URLSearchParams({
    repository: 'team/api',
    digest: server.fixture.digest,
  })

  await context.test('startup discovery scans without a browser starting a job', async () => {
    let complete = false

    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await request(`${endpoint}?${query}`)
      const data = await status.json()

      assert.equal(status.status, 200)
      assert.equal(data.enabled, true)

      if (data.status === 'complete') {
        assert.equal(data.report.digest, server.fixture.digest)
        complete = true
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    assert.equal(complete, true, 'background worker must finish the seeded image')
  })

  await context.test(
    'completed digest requests reuse reports and preserve access controls',
    async () => {
      const body = { repository: 'team/api', digest: server.fixture.digest }
      const first = await request(endpoint, { method: 'POST', body })
      const second = await request(endpoint, { method: 'POST', body })
      const viewer = await request(endpoint, {
        method: 'POST',
        body,
        cookie: reader.cookie,
      })

      const foreign = await request(endpoint, {
        method: 'POST',
        body,
        origin: 'https://evil.example',
      })

      assert.equal(first.status, 200)
      assert.equal(second.status, 200)
      assert.equal((await first.json()).status, 'complete')
      assert.equal((await second.json()).report.digest, body.digest)
      assert.equal(viewer.status, 403)
      assert.equal(foreign.status, 403)

      const scanned = readFileSync(capture, 'utf8').trim().split('\n')
      const references = scanned.map((line) => JSON.parse(line) as string)
      const root = references.filter((reference) => reference.endsWith(`@${server.fixture.digest}`))

      assert.equal(root.length, 1, 'tag aliases and repeated POSTs must not start duplicate jobs')
    }
  )

  await context.test(
    'manual requests cannot bypass the budget used by background scans',
    async () => {
      const image = await request(
        `/api/registries/${encodeURIComponent(id)}/image?repository=team%2Fapi&reference=multi`
      )
      const details = await image.json()

      assert.equal(image.status, 200)
      assert.notEqual(details.digest, server.fixture.digest)

      const response = await request(endpoint, {
        method: 'POST',
        body: { repository: 'team/api', digest: details.digest },
      })

      const retry = Number(response.headers.get('Retry-After'))

      assert.equal(response.status, 429)
      assert.ok(retry > 0 && retry <= 900)
      assert.match((await response.json()).error, /scan budget/)
      assert.equal(readFileSync(capture, 'utf8').trim().split('\n').length, 1)
    }
  )
})

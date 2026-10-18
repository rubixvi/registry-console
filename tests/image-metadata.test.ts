import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import { imageDetails } from '../src/lib/registry/image'
import { AppError } from '../src/lib/security/error'
import { type ImageManifest } from '../src/types/image'
import { type RegistryRecord } from '../src/types/registry'
import { imageCreated } from '../src/utils/image-metadata'
import { imageSummary } from '../src/utils/image-summary'

const objects = new Map<string, string>()
const requests = new Map<string, number>()
const aliases = new Map<string, string>()

let registry: RegistryRecord

function descriptor(value: unknown) {
  const text = JSON.stringify(value)
  const digest = `sha256:${createHash('sha256').update(text).digest('hex')}`

  objects.set(digest, text)

  return {
    digest,
    size: Buffer.byteLength(text),
  }
}

const shared = {
  digest: `sha256:${'a'.repeat(64)}`,
  size: 1024,
}

const extra = {
  digest: `sha256:${'b'.repeat(64)}`,
  size: 2048,
}

function image(architecture: string, created?: string, layers = [shared], annotations?: unknown) {
  const config = descriptor({
    os: 'linux',
    architecture,
    created,
  })

  const manifest = descriptor({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config,
    layers,
    annotations,
  })

  return {
    ...manifest,
    platform: {
      os: 'linux',
      architecture,
    },
    config,
  }
}

const amd64 = image('amd64', '2026-10-15T12:00:00Z')
const arm64 = image('arm64', '2026-10-16T12:00:00Z', [shared, extra])

const attestation = {
  digest: `sha256:${'c'.repeat(64)}`,
  size: 837,
  platform: {
    os: 'unknown',
    architecture: 'unknown',
  },
  annotations: {
    'vnd.docker.reference.type': 'attestation-manifest',
  },
}

function index(name: string, manifests: unknown[]) {
  const result = descriptor({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests,
  })

  aliases.set(name, result.digest)

  return result
}

const single = index('single', [amd64, attestation])

index('multi', [amd64, arm64, attestation])
index('nested', [single, amd64])

aliases.set('plain', amd64.digest)

const noDate = image('amd64')

aliases.set('undated', noDate.digest)

const annotated = image('arm64', 'invalid', [], {
  'org.opencontainers.image.created': '2026-10-16T14:30:00+02:00',
})

aliases.set('annotated', annotated.digest)

const proof = {
  digest: `sha256:${'d'.repeat(64)}`,
  size: 512,
  mediaType: 'application/vnd.in-toto+json',
}

const legacy = descriptor({
  schemaVersion: 2,
  config: {
    ...descriptor({ os: 'unknown', architecture: 'unknown' }),
    mediaType: 'application/vnd.oci.image.config.v1+json',
  },
  layers: [proof],
})

const artifact = descriptor({
  schemaVersion: 2,
  artifactType: 'application/vnd.docker.attestation.manifest.v1+json',
  config: {
    ...descriptor({}),
    mediaType: 'application/vnd.oci.empty.v1+json',
  },
  layers: [proof],
})

const disguised = descriptor({
  schemaVersion: 2,
  config: {
    ...amd64.config,
    mediaType: 'application/vnd.oci.image.config.v1+json',
  },
  layers: [proof],
})

index('mixed', [amd64, legacy, artifact, disguised])

const broken = image('arm64', '2026-10-16T00:00:00Z')

index('broken', [broken])
objects.set(broken.config.digest, '{}')

index(
  'oversized',
  Array.from({ length: 33 }, (_, i) => image(`test${i}`))
)

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://registry').pathname)

  const reference = pathname.split('/').at(-1) ?? ''
  const digest = aliases.get(reference) ?? reference
  const text = objects.get(digest)

  requests.set(pathname, (requests.get(pathname) ?? 0) + 1)

  response.setHeader('Content-Type', 'application/json')

  if (!text) {
    response.writeHead(404).end('{}')

    return
  }

  response.end(text)
})

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()

  assert.ok(address && typeof address !== 'string')

  const url = `http://127.0.0.1:${address.port}`

  Object.assign(process.env, {
    APP_ORIGIN: 'https://console.example.com',
    ENCRYPTION_KEY: 'e'.repeat(64),
    REGISTRY_ALLOWED_ORIGINS: url,
    ALLOW_HTTP_REGISTRIES: 'true',
  })

  registry = {
    id: 'metadata-tests',
    name: 'Metadata',
    url,
    pullUrl: '',
    username: '',
    password: '',
    readOnly: false,
  }
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

test('single-platform images expose configuration creation time and compressed blob size', async () => {
  const result = await imageDetails(registry, 'team/app', 'plain')

  assert.equal(result.created, '2026-10-15T12:00:00.000Z')
  assert.equal(result.size, amd64.config.size + shared.size)
  assert.equal(imageSummary(result).platform, 'linux/amd64')
})

test('an index with an attestation derives metadata from its runnable image and preserves raw JSON', async () => {
  const result = await imageDetails(registry, 'team/app', 'single')

  assert.equal(result.created, '2026-10-15T12:00:00.000Z')
  assert.equal(result.size, amd64.config.size + shared.size)

  assert.deepEqual(result.platforms, ['linux/amd64'])
  assert.equal(result.platformDetails.length, 1)

  assert.equal((result.manifest as ImageManifest).manifests?.length, 2)
  assert.equal(requests.get(`/v2/team/app/manifests/${attestation.digest}`), undefined)
})

test('multi-platform totals count shared blobs once and retain each platform date and size', async () => {
  const result = await imageDetails(registry, 'team/app', 'multi')

  assert.equal(result.created, '2026-10-16T12:00:00.000Z')

  assert.equal(result.size, amd64.config.size + arm64.config.size + shared.size + extra.size)

  assert.equal(result.platformDetails[0].size, amd64.config.size + shared.size)

  assert.equal(result.platformDetails[1].size, arm64.config.size + shared.size + extra.size)

  assert.deepEqual(result.platforms, ['linux/amd64', 'linux/arm64'])
})

test('nested indexes and repeated image descriptors do not duplicate image metadata', async () => {
  const result = await imageDetails(registry, 'team/app', 'nested')

  assert.equal(result.platformDetails.length, 1)
  assert.equal(result.size, amd64.config.size + shared.size)
})

test('missing dates remain missing and valid OCI annotations provide a UTC fallback', async () => {
  assert.equal((await imageDetails(registry, 'team/app', 'undated')).created, null)

  assert.equal(
    (await imageDetails(registry, 'team/app', 'annotated')).created,
    '2026-10-16T12:30:00.000Z'
  )

  assert.equal(imageCreated('invalid'), null)
  assert.equal(imageCreated('1'), null)
})

test('child configuration digest mismatches fail instead of exposing unverified metadata', async () => {
  await assert.rejects(imageDetails(registry, 'team/app', 'broken'), (error: unknown) => {
    assert.ok(error instanceof AppError)
    assert.equal(error.status, 502)
    assert.match(error.message, /configuration digest/)

    return true
  })
})

test('oversized indexes return an explicit limit error instead of partial totals', async () => {
  await assert.rejects(imageDetails(registry, 'team/app', 'oversized'), (error: unknown) => {
    assert.ok(error instanceof AppError)
    assert.equal(error.status, 413)

    return true
  })
})

test('direct attestation manifests retain inspection data without exposing runnable platforms', async () => {
  for (const entry of [legacy, artifact, disguised]) {
    const result = await imageDetails(registry, 'team/app', entry.digest)

    assert.equal(result.digest, entry.digest)
    assert.deepEqual(result.platformDetails, [])
    assert.deepEqual(result.platforms, [])
    assert.equal((result.manifest as ImageManifest).layers?.[0].mediaType, proof.mediaType)
  }
})

test('unmarked artifacts in an index are excluded from image platforms and compressed totals', async () => {
  const result = await imageDetails(registry, 'team/app', 'mixed')

  assert.deepEqual(result.platforms, ['linux/amd64'])
  assert.equal(result.platformDetails.length, 1)
  assert.equal(result.size, amd64.config.size + shared.size)
})

test('runnable images with an empty layer list remain eligible for scanning', async () => {
  const result = await imageDetails(registry, 'team/app', annotated.digest)

  assert.equal(result.platformDetails.length, 1)
  assert.equal(result.platformDetails[0].digest, annotated.digest)
})

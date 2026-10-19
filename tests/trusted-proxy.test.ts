import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { NextRequest } from 'next/server'

import { auditIp, auditRequest } from '../src/lib/audit'
import { limitSignIn } from '../src/lib/auth/limit'
import { clientAddress } from '../src/lib/auth/limit/client-address'
import { env } from '../src/lib/config/env'
import { audit, auditPage } from '../src/lib/database/audit'
import { database } from '../src/lib/database/client'
import { AppError } from '../src/lib/security/error'
import { trustedProxy } from '../src/lib/security/proxy'
import { envSchema } from '../src/lib/validation/env'
import { proxyList } from '../src/lib/validation/proxy'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-trusted-proxy-'))

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'a'.repeat(64),
  REGISTRY_PEER_KEY: 'signed-proxy-test-key',
  TRUST_PROXY: 'true',
  TRUSTED_PROXIES: '10.0.0.2, 192.0.2.0/24, 2001:db8:1::/48',
})

beforeEach(() => {
  env().TRUST_PROXY = 'true'
  env().TRUSTED_PROXIES = proxyList.parse(process.env.TRUSTED_PROXIES)
  database().prepare('DELETE FROM limits').run()
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

function request(peer: string, forwarded?: string, age = 0) {
  const value = `${peer};${Date.now() - age}`
  const signature = createHmac('sha256', process.env.REGISTRY_PEER_KEY!).update(value).digest('hex')
  const headers = new Headers({ 'x-registry-peer': `${value};${signature}` })

  if (forwarded !== undefined) headers.set('x-forwarded-for', forwarded)

  return new NextRequest('https://console.example.com/api/auth/login', { headers })
}

test('proxy configuration accepts bounded IP and CIDR lists and rejects invalid trust entries', () => {
  assert.deepEqual(proxyList.parse(''), [])
  assert.deepEqual(proxyList.parse('192.0.2.1, 2001:db8::/32'), ['192.0.2.1', '2001:db8::/32'])

  for (const value of [
    '*',
    'proxy.example.com',
    'https://192.0.2.1',
    '192.0.2.1:8080',
    '192.0.2.0/33',
    '192.0.2.0/-1',
    '192.0.2.0/1.5',
    '192.0.2.0/01',
    '192.0.2.0/24/extra',
    '192.0.2.0/',
    '[2001:db8::1]',
    '2001:db8::/129',
    'fe80::1%eth0',
    Array.from({ length: 257 }, () => '192.0.2.1').join(','),
  ]) {
    assert.equal(proxyList.safeParse(value).success, false, value)
    assert.equal(envSchema.safeParse({ ...process.env, TRUSTED_PROXIES: value }).success, false)
  }
})

test('trusted chains stop at the closest untrusted address and ignore spoofed entries to its left', () => {
  assert.equal(
    clientAddress(request('10.0.0.2', '203.0.113.9, 198.51.100.7, 192.0.2.8')),
    '198.51.100.7'
  )
  assert.equal(
    clientAddress(request('10.0.0.2', '192.0.2.99, 198.51.100.7, 192.0.2.8')),
    '198.51.100.7'
  )
  assert.equal(
    clientAddress(request('10.0.0.2', 'malformed, 198.51.100.7, 192.0.2.8')),
    '198.51.100.7'
  )
  assert.equal(clientAddress(request('10.0.0.2', '198.51.100.7, 192.0.3.8')), '192.0.3.8')
  assert.equal(clientAddress(request('10.0.0.2', '192.0.2.7, 192.0.2.8')), '192.0.2.7')
})

test('untrusted socket peers cannot supply forwarded addresses or force proxy parsing errors', () => {
  assert.equal(clientAddress(request('198.51.100.7', '192.0.2.8')), '198.51.100.7')
  assert.equal(clientAddress(request('10.0.0.3', 'malformed')), '10.0.0.3')
  assert.equal(clientAddress(request('198.51.100.7')), '198.51.100.7')
  env().TRUST_PROXY = 'false'
  assert.equal(clientAddress(request('10.0.0.2', '198.51.100.7, 192.0.2.8')), '10.0.0.2')
})

test('IPv6 and mapped IPv4 addresses use the same normalized trust and rate limit identities', () => {
  assert.equal(
    clientAddress(request('::ffff:a00:2', '198.51.100.7, ::ffff:c000:208')),
    '198.51.100.7'
  )
  assert.equal(
    clientAddress(request('2001:DB8:1::2', '2001:DB8:2:0:0:0:0:7, 2001:DB8:1::3')),
    '2001:db8:2::7'
  )
  assert.equal(trustedProxy('192.0.2.255'), true)
  assert.equal(trustedProxy('192.0.3.0'), false)
  env().TRUSTED_PROXIES = proxyList.parse('::ffff:192.0.2.0/120')
  assert.equal(trustedProxy('192.0.2.7'), true)
  assert.equal(trustedProxy('192.0.3.7'), false)
})

test('malformed or oversized trusted chains are rejected without trusting other headers', () => {
  for (const value of [
    undefined,
    '',
    '198.51.100.7, invalid',
    '198.51.100.7,',
    '198.51.100.7:8080',
    'unknown',
    'fe80::1%eth0',
    Array.from({ length: 17 }, () => '192.0.2.8').join(','),
    '1'.repeat(2049),
  ]) {
    assert.throws(() => clientAddress(request('10.0.0.2', value)), /forwarded/)
  }

  const value = request('10.0.0.2')

  value.headers.set('x-real-ip', '198.51.100.7')
  value.headers.set('cf-connecting-ip', '198.51.100.7')
  assert.throws(() => clientAddress(value), /forwarded/)
})

test('a trusted list requires a valid signed socket peer and production fails closed without one', () => {
  const value = request('10.0.0.2', '198.51.100.7')
  const previous = process.env.NODE_ENV

  value.headers.set('x-registry-peer', '10.0.0.2;1;forged')

  try {
    Object.assign(process.env, { NODE_ENV: 'production' })
    assert.throws(
      () => clientAddress(value),
      (error: unknown) => error instanceof AppError && error.status === 503
    )
    assert.throws(() => clientAddress(request('10.0.0.2', '198.51.100.7', 60_001)), /scripts\/peer/)
    assert.throws(
      () => clientAddress(request('10.0.0.2', '198.51.100.7', -10_000)),
      /scripts\/peer/
    )
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV')
    else Object.assign(process.env, { NODE_ENV: previous })
  }
})

test('empty trusted lists preserve the existing single-proxy behavior', () => {
  env().TRUSTED_PROXIES = []

  assert.equal(
    clientAddress(
      new Request('https://console.example.com', {
        headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.7' },
      })
    ),
    '198.51.100.7'
  )
})

test('audit events and sign-in limits share the resolved client IP behind several proxies', async () => {
  const handler = auditRequest(async (value: NextRequest) => {
    const source = limitSignIn(value, 'chain')

    audit('reader', 'login.password.failed', '')
    assert.equal(auditIp(), source)
  })

  for (let index = 0; index < 30; index++) {
    await handler(request('10.0.0.2', '198.51.100.7, 192.0.2.8'))
  }

  assert.throws(
    () => limitSignIn(request('10.0.0.2', '203.0.113.9, 198.51.100.7, 192.0.2.8'), 'chain'),
    (error: unknown) => error instanceof AppError && error.status === 429
  )
  await handler(request('10.0.0.2', '198.51.100.8, 192.0.2.8'))

  const page = auditPage({
    actor: 'reader',
    action: '',
    query: '198.51.100.7',
    from: '',
    to: '',
    before: 0,
    n: 100,
  })

  assert.equal(page.total, 30)
  assert.ok(page.items.every((entry) => entry.ip === '198.51.100.7'))
})

test('the real socket launcher anchors proxy trust and overwrites forged peer headers', async () => {
  await import(pathToFileURL(path.resolve('scripts/peer.mjs')).href)
  env().TRUSTED_PROXIES = proxyList.parse('127.0.0.1,192.0.2.0/24')

  const server = createServer((incoming, response) => {
    const headers = new Headers()

    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value)
    }

    response.end(
      JSON.stringify({
        address: clientAddress(new Request('https://console.example.com', { headers })),
      })
    )
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const address = server.address() as { port: number }
    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      headers: {
        'x-forwarded-for': '203.0.113.9, 198.51.100.7, 192.0.2.8',
        'x-registry-peer': '198.51.100.99;1;forged',
      },
    })

    assert.deepEqual(await response.json(), { address: '198.51.100.7' })
    env().TRUSTED_PROXIES = proxyList.parse('192.0.2.0/24')
    const direct = await fetch(`http://127.0.0.1:${address.port}`, {
      headers: { 'x-forwarded-for': '198.51.100.7' },
    })

    assert.deepEqual(await direct.json(), { address: '127.0.0.1' })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

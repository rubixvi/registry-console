import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, test } from 'node:test'
import { NextRequest } from 'next/server'

import { auditBackground, auditIp, auditRequest } from '../src/lib/audit'
import { env } from '../src/lib/config/env'
import { audit, auditPage } from '../src/lib/database/audit'
import { database } from '../src/lib/database/client'
import { type AuditInput } from '../src/types/audit'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-audit-'))
const key = 'b'.repeat(64)
const input: AuditInput = {
  actor: '',
  action: '',
  query: '',
  from: '',
  to: '',
  before: 0,
  n: 100,
}

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'a'.repeat(64),
  REGISTRY_PEER_KEY: key,
  TRUST_PROXY: 'false',
})

const legacy = new DatabaseSync(path.join(directory, 'console.sqlite'))

legacy.exec(`
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL
  )
`)
legacy
  .prepare('INSERT INTO audit (at, actor, action, target) VALUES (?, ?, ?, ?)')
  .run(new Date().toISOString(), 'legacy', 'registry.add', 'original')
legacy.close()

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

function request(address: string, headers: Record<string, string> = {}) {
  const value = `${address};${Date.now()}`
  const signature = createHmac('sha256', key).update(value).digest('hex')

  return new NextRequest('https://console.example.com/api/audit', {
    headers: { 'x-registry-peer': `${value};${signature}`, ...headers },
  })
}

test('audit migration preserves existing history without inventing an IP', () => {
  const page = auditPage(input)

  assert.equal(page.total, 1)
  assert.equal(page.items[0].actor, 'legacy')
  assert.equal(page.items[0].target, 'original')
  assert.equal(page.items[0].ip, '')

  database()
    .prepare('INSERT INTO audit (at, actor, action, target) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), 'script', 'security.reset', '')

  assert.equal(auditPage({ ...input, actor: 'script' }).items[0].ip, '')
})

test('concurrent asynchronous requests keep their own signed IPv4 and IPv6 addresses', async () => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = auditRequest(async () => {
    await pending
    audit('first', 'registry.update', 'one')
  })
  const second = auditRequest(async () => {
    audit('second', 'registry.update', 'two')
    release()
    await pending
    assert.equal(auditIp(), '2001:db8::2')
  })

  await Promise.all([first(request('192.0.2.1')), second(request('2001:db8::2'))])

  assert.equal(auditPage({ ...input, actor: 'first' }).items[0].ip, '192.0.2.1')
  assert.equal(auditPage({ ...input, actor: 'second' }).items[0].ip, '2001:db8::2')
  assert.equal(auditIp(), '')
})

test('audit ignores spoofed forwarded headers when proxy trust is disabled', () => {
  const handler = auditRequest(() => audit('socket', 'login.password.failed', ''))

  handler(request('::ffff:192.0.2.3', { 'x-forwarded-for': '203.0.113.99' }))

  assert.equal(auditPage({ ...input, actor: 'socket' }).items[0].ip, '192.0.2.3')
})

test('missing or forged socket signatures never become audit addresses', () => {
  const handler = auditRequest(() => audit('forged', 'login.password.failed', ''))

  const sources: Record<string, string>[] = [
    { 'x-forwarded-for': '203.0.113.99' },
    { 'x-registry-peer': `203.0.113.99;${Date.now()};${'0'.repeat(64)}` },
  ]

  for (const headers of sources) {
    handler(new NextRequest('https://console.example.com/api/auth/login', { headers }))
  }

  const page = auditPage({ ...input, actor: 'forged' })

  assert.equal(page.total, 2)
  assert.ok(page.items.every((row) => row.ip === ''))
})

test('trusted proxy audit addresses use the validated rightmost hop', () => {
  const config = env()
  const previous = config.TRUST_PROXY

  config.TRUST_PROXY = 'true'

  try {
    const handler = auditRequest(() => audit('proxy', 'registry.add', ''))

    handler(request('192.0.2.4', { 'x-forwarded-for': '203.0.113.99, ::ffff:198.51.100.4' }))

    assert.equal(auditPage({ ...input, actor: 'proxy' }).items[0].ip, '198.51.100.4')

    handler(request('192.0.2.4', { 'x-forwarded-for': '203.0.113.99, invalid' }))

    assert.equal(auditPage({ ...input, actor: 'proxy' }).items[0].ip, '')
  } finally {
    config.TRUST_PROXY = previous
  }
})

test('background audit events clear request addresses and restore the enclosing context', async () => {
  const handler = auditRequest(async () => {
    await auditBackground(async () => {
      await Promise.resolve()
      audit('background', 'image.scan.complete', '')
    })

    audit('foreground', 'image.scan.queued', '')
  })

  await handler(request('192.0.2.5'))
  audit('system', 'security.account.removed', '')

  assert.equal(auditPage({ ...input, actor: 'background' }).items[0].ip, '')
  assert.equal(auditPage({ ...input, actor: 'foreground' }).items[0].ip, '192.0.2.5')
  assert.equal(auditPage({ ...input, actor: 'system' }).items[0].ip, '')
})

test('IP search respects filters, pagination and literal wildcard escaping', () => {
  const handler = auditRequest(() => {
    audit('search', 'registry.add', 'first')
    audit('search', 'registry.add', 'second')
  })

  handler(request('198.51.100.6'))

  const first = auditPage({ ...input, actor: 'search', query: '198.51.100.6', n: 1 })

  assert.equal(first.total, 2)
  assert.equal(first.items.length, 1)
  assert.equal(first.items[0].target, 'second')
  assert.ok(first.next)

  const second = auditPage({ ...input, query: '198.51.100.6', before: first.next!, n: 1 })

  assert.equal(second.items[0].target, 'first')
  assert.equal(second.next, null)
  assert.equal(auditPage({ ...input, query: '198.51.100.%' }).total, 0)
  assert.equal(auditPage({ ...input, query: '198.51.100.6', action: 'login.failed' }).total, 0)
})

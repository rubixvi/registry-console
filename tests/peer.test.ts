import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { limitSignIn } from '../src/lib/auth/limit'
import { clientAddress } from '../src/lib/auth/limit/client-address'
import { database } from '../src/lib/database/client'
import { AppError } from '../src/lib/security/error'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-peer-'))

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'd'.repeat(64),
  TRUST_PROXY: 'false',
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

test('the server supplies the real socket peer and overwrites spoofed internal address headers', async () => {
  await import(pathToFileURL(path.resolve('scripts/peer.mjs')).href)

  const server = createServer((incoming, response) => {
    const headers = new Headers()

    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value) headers.set(name, Array.isArray(value) ? value.join(',') : value)
    }

    const address = clientAddress(new Request('https://console.example.com', { headers }))

    response.end(JSON.stringify({ address }))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const address = server.address() as { port: number }
    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      headers: { 'X-Forwarded-For': '203.0.113.1', 'X-Registry-Peer': 'forged' },
    })

    assert.deepEqual(await response.json(), { address: '127.0.0.1' })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('per-IP limits work without proxy trust and do not lock a different source out', () => {
  function request(address: string) {
    const value = `${address};${Date.now()}`
    const signature = createHmac('sha256', process.env.REGISTRY_PEER_KEY!)
      .update(value)
      .digest('hex')

    return new Request('https://console.example.com', {
      headers: { 'X-Registry-Peer': `${value};${signature}`, 'X-Forwarded-For': 'forged' },
    })
  }

  for (let count = 0; count < 30; count++) limitSignIn(request('192.0.2.1'), 'password')

  assert.throws(
    () => limitSignIn(request('192.0.2.1'), 'password'),
    (error: unknown) => error instanceof AppError && error.status === 429
  )
  assert.doesNotThrow(() => limitSignIn(request('198.51.100.1'), 'password'))
})

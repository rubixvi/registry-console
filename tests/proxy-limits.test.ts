import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { limitSignIn } from '../src/lib/auth/limit'
import { database } from '../src/lib/database/client'
import { apiError } from '../src/lib/security/api'
import { AppError } from '../src/lib/security/error'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-proxy-limits-'))

Object.assign(process.env, {
  APP_ORIGIN: 'https://limits.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'e'.repeat(64),
  TRUST_PROXY: 'true',
})

after(() => {
  database().close()

  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
})

function request(source?: string) {
  return new Request('https://limits.example.com', {
    headers: source ? { 'X-Forwarded-For': source } : {},
  })
}

test('trusted proxy clients receive independent persistent limits and accurate retry windows', () => {
  for (let index = 0; index < 30; index++) {
    limitSignIn(request('192.0.2.1'), 'password')
  }

  assert.throws(
    () => limitSignIn(request('192.0.2.1'), 'password'),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.status, 429)
      assert.ok(Number(apiError(error).headers.get('Retry-After')) > 60)

      return true
    }
  )
  assert.doesNotThrow(() => limitSignIn(request('198.51.100.2'), 'password'))
  assert.throws(() => limitSignIn(request(), 'password'), /forwarded/)
  assert.throws(() => limitSignIn(request('arbitrary-client-id'), 'password'), /forwarded/)
})

test('a spoofed first forwarded address cannot change the trusted rightmost client hop', () => {
  assert.equal(limitSignIn(request('203.0.113.1, 198.51.100.20'), 'source-test'), '198.51.100.20')
  assert.equal(limitSignIn(request('192.0.2.8, 198.51.100.20'), 'source-test'), '198.51.100.20')
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { appOrigin } from '../src/lib/config/origin'

test('production accepts HTTP on loopback hosts', () => {
  const origins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://127.1.2.3:3000',
    'http://[::1]:3000',
  ]

  for (const origin of origins) {
    assert.equal(appOrigin(origin, true), origin)
  }
})

test('production accepts HTTPS on non-loopback hosts', () => {
  const origin = 'https://registry-ui.example.com'

  assert.equal(appOrigin(origin, true), origin)
})

test('production rejects HTTP on non-loopback hosts', () => {
  const origins = [
    'http://registry-ui.example.com',
    'http://localhost.evil.example',
    'http://127.0.0.1.evil.example',
    'http://192.168.1.10',
    'http://[::2]',
  ]

  for (const origin of origins) {
    assert.throws(() => appOrigin(origin, true), origin)
  }
})

test('development accepts HTTP on non-loopback hosts', () => {
  const origin = 'http://local.example:3000'

  assert.equal(appOrigin(origin, false), origin)
})

test('unsupported protocols are rejected in all modes', () => {
  for (const production of [true, false]) {
    assert.throws(() => appOrigin('ftp://localhost', production))
    assert.throws(() => appOrigin('file:///etc/passwd', production))
  }
})

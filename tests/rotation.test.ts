import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createCipheriv, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { database } from '../src/lib/database/client'
import { decryptSecret, encryptSecret } from '../src/lib/security/crypto'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-rotation-'))
const old = 'b'.repeat(64)
const current = 'c'.repeat(64)

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: current,
  ENCRYPTION_KEY_ID: 'current',
  ENCRYPTION_KEYS_JSON: JSON.stringify({ old }),
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

function legacy(value: string, version = 'v1') {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(old, 'hex'), iv)

  if (version === 'v2') cipher.setAAD(Buffer.from('registry-console:v2:old'))

  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

  return [
    version,
    ...(version === 'v2' ? ['old'] : []),
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    data.toString('hex'),
  ].join('.')
}

test('key rings read legacy and versioned secrets while new writes bind their key ID with AAD', () => {
  assert.equal(decryptSecret(legacy('legacy-password')), 'legacy-password')
  assert.equal(decryptSecret(legacy('old-envelope', 'v2')), 'old-envelope')

  const encrypted = encryptSecret('current-password')

  assert.match(encrypted, /^v2\.current\./)
  assert.equal(decryptSecret(encrypted), 'current-password')
  assert.throws(() => decryptSecret(encrypted.replace('v2.current.', 'v2.old.')))
  assert.throws(() => decryptSecret(encrypted.replace(/^v2\.current\./, 'v1.')))
})

test('the rotation utility re-encrypts the database atomically and preserves empty credentials', () => {
  const db = database()

  db.prepare(`
    INSERT INTO registries (id, name, url, username, password)
    VALUES ('old', 'Old', 'https://registry.example.com', 'user', ?),
           ('public', 'Public', 'https://public.example.com', '', '')
  `).run(legacy('registry-password'))
  db.prepare(`
    INSERT INTO authenticators (username, fingerprint, secret, last_step, recovery)
    VALUES ('user', 'identity', ?, -1, '[]')
  `).run(legacy('authenticator-secret'))

  const result = spawnSync(process.execPath, ['scripts/rotate-key.mjs'], {
    env: process.env,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  const row = db.prepare("SELECT password FROM registries WHERE id = 'old'").get()!
  const secret = db.prepare("SELECT secret FROM authenticators WHERE username = 'user'").get()!

  assert.match(String(row.password), /^v2\.current\./)
  assert.equal(decryptSecret(String(row.password)), 'registry-password')
  assert.equal(decryptSecret(String(secret.secret)), 'authenticator-secret')
  assert.equal(
    db.prepare("SELECT password FROM registries WHERE id = 'public'").get()!.password,
    ''
  )
})

test('unreadable secrets roll back every earlier key rotation update', () => {
  const db = database()
  const encrypted = legacy('must-remain-under-old-key')

  db.prepare("UPDATE registries SET password = ? WHERE id = 'old'").run(encrypted)
  db.prepare("UPDATE authenticators SET secret = 'invalid' WHERE username = 'user'").run()

  const result = spawnSync(process.execPath, ['scripts/rotate-key.mjs'], {
    env: process.env,
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.equal(
    db.prepare("SELECT password FROM registries WHERE id = 'old'").get()!.password,
    encrypted
  )
  assert.equal(
    db.prepare("SELECT secret FROM authenticators WHERE username = 'user'").get()!.secret,
    'invalid'
  )
})

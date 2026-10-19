import assert from 'node:assert/strict'
import { test } from 'node:test'

import { env } from '../src/lib/config/env'
import { userFingerprint } from '../src/lib/config/users'
import { type User } from '../src/types/auth'

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  ENCRYPTION_KEY: 'e'.repeat(64),
})

const local: User = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'reader',
  email: 'reader@example.com',
  role: 'member',
  passwordHash: `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`,
}
const directory: User = {
  id: local.id,
  username: local.username,
  email: local.email,
  role: local.role,
  authProvider: 'ldap',
  directory: { source: 'directory-one', subject: 'account-one' },
}

test('session fingerprints use only defined account fields and ignore object property order', () => {
  const extended = { ...local, password: 'never-fingerprint-this', diagnostic: 'private' }
  const reordered = Object.fromEntries(Object.entries(local).reverse()) as User

  assert.equal(userFingerprint(extended), userFingerprint(local))
  assert.equal(userFingerprint(reordered), userFingerprint(local))
  assert.equal(userFingerprint({ ...local, authProvider: 'local' }), userFingerprint(local))
  assert.match(userFingerprint(local), /^[a-f0-9]{64}$/)
})

test('local session fingerprints change with identity, role and validated scrypt hashes', () => {
  const original = userFingerprint(local)

  for (const change of [
    { id: '00000000-0000-4000-8000-000000000002' },
    { username: 'renamed' },
    { email: 'changed@example.com' },
    { role: 'admin' as const },
    { passwordHash: local.passwordHash!.replace(/0$/, '1') },
    { authProvider: 'sso' as const },
  ]) {
    assert.notEqual(userFingerprint({ ...local, ...change }), original)
  }

  assert.throws(() => userFingerprint({ ...local, passwordHash: 'plaintext' }))
  assert.throws(() => userFingerprint({ ...local, passwordHash: undefined }))
})

test('directory fingerprints exclude passwords and bind sessions to the directory identity', () => {
  const original = userFingerprint(directory)
  const extended = { ...directory, password: 'ldap-password', passwordHash: 'unused' }

  assert.equal(userFingerprint(extended), original)

  for (const change of [
    { directory: { source: 'directory-two', subject: 'account-one' } },
    { directory: { source: 'directory-one', subject: 'account-two' } },
    { role: 'viewer' as const },
    { username: 'renamed' },
    { email: 'changed@example.com' },
  ]) {
    assert.notEqual(userFingerprint({ ...directory, ...change }), original)
  }

  for (const name of ['LDAP_URL', 'LDAP_BASE_DN', 'LDAP_USER_FILTER']) {
    const previous = process.env[name]

    try {
      process.env[name] = `${previous ?? ''}-changed`
      assert.notEqual(userFingerprint(directory), original)
    } finally {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    }
  }
})

test('session fingerprints are keyed independently from public account metadata', () => {
  const config = env()
  const previous = config.ENCRYPTION_KEY
  const original = userFingerprint(local)

  try {
    config.ENCRYPTION_KEY = 'f'.repeat(64)
    assert.notEqual(userFingerprint(local), original)
  } finally {
    config.ENCRYPTION_KEY = previous
  }

  assert.equal(userFingerprint(local), original)
})

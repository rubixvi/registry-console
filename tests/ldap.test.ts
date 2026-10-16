import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { Client, InvalidCredentialsError } from 'ldapts'

import { verifyCredentials } from '../src/lib/auth/credentials'
import {
  escapeLdapFilter,
  ldapClientOptions,
  ldapConfiguration,
  verifyLdapPassword,
} from '../src/lib/auth/ldap'
import { authPasskey, regOptions } from '../src/lib/auth/passkeys'
import { createSession } from '../src/lib/auth/session'
import { env } from '../src/lib/config/env'
import { database } from '../src/lib/database/client'
import { encryptSecret } from '../src/lib/security/crypto'
import { userSchema } from '../src/lib/validation/auth'
import { type User } from '../src/types/auth'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-ldap-'))

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  ENCRYPTION_KEY: 'd'.repeat(64),
  DATA_DIR: directory,
  LDAP_ENABLED: 'true',
  LDAP_URL: 'ldap://directory.example.com:389',
  LDAP_STARTTLS: 'true',
  LDAP_BASE_DN: 'ou=People,dc=example,dc=com',
  LDAP_BIND_DN: 'cn=search,dc=example,dc=com',
  LDAP_BIND_PASSWORD_ENCRYPTED: 'placeholder',
})

env().LDAP_BIND_PASSWORD_ENCRYPTED = encryptSecret('directory-search-secret')

const user: User = { username: 'reader', role: 'viewer', authProvider: 'ldap' }

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

test('directory filters escape LDAP metacharacters and cleartext or ambiguous configuration fails closed', () => {
  assert.equal(escapeLdapFilter('a*)(uid=*)\\\0'), 'a\\2a\\29\\28uid=\\2a\\29\\5c\\00')
  assert.equal(userSchema.safeParse(user).success, true)
  assert.equal(userSchema.safeParse({ username: 'reader', role: 'viewer' }).success, false)
  assert.equal(
    userSchema.safeParse({
      ...user,
      passwordHash: `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`,
    }).success,
    false
  )

  const config = env()

  config.LDAP_STARTTLS = 'false'
  assert.throws(ldapConfiguration, /LDAPS or StartTLS/)
  config.LDAP_STARTTLS = 'true'

  config.LDAP_USER_FILTER = '(|(uid={username})(mail={username}))'
  assert.throws(ldapConfiguration, /LDAPS or StartTLS/)
  config.LDAP_USER_FILTER = '(uid={username})'
})

test('directory authentication upgrades TLS before either bind and requires one unambiguous search result', async (context) => {
  const calls: string[] = []

  context.mock.method(
    Client.prototype,
    'startTLS',
    async (options: { rejectUnauthorized?: boolean }) => {
      assert.equal(options.rejectUnauthorized, true)
      calls.push('tls')
    }
  )
  context.mock.method(Client.prototype, 'bind', async (dn: string, password: string) => {
    calls.push(String(dn))
    assert.equal(
      password,
      String(dn).startsWith('cn=search') ? 'directory-search-secret' : 'user-password'
    )
  })
  context.mock.method(
    Client.prototype,
    'search',
    async (_base: string, options: { filter?: string; sizeLimit?: number }) => {
      assert.equal(options.filter, '(uid=reader)')
      assert.equal(options.sizeLimit, 2)
      return {
        searchEntries: [{ dn: 'uid=reader,ou=People,dc=example,dc=com' }],
        searchReferences: [],
      }
    }
  )
  context.mock.method(Client.prototype, 'unbind', async () => {
    calls.push('unbind')
  })

  assert.equal(await verifyCredentials('user-password', user), true)
  assert.deepEqual(calls, [
    'tls',
    'cn=search,dc=example,dc=com',
    'uid=reader,ou=People,dc=example,dc=com',
    'unbind',
  ])

  context.mock.method(Client.prototype, 'search', async () => ({
    searchEntries: [{ dn: 'uid=one' }, { dn: 'uid=two' }],
    searchReferences: [],
  }))
  assert.equal(await verifyLdapPassword('reader', 'user-password'), false)
})

test('empty passwords never bind and directory failures never disclose diagnostics', async (context) => {
  let binds = 0

  context.mock.method(Client.prototype, 'startTLS', async () => undefined)
  context.mock.method(Client.prototype, 'bind', async () => {
    binds++
    throw new Error('a-private-directory-detail')
  })
  context.mock.method(Client.prototype, 'unbind', async () => undefined)

  assert.equal(await verifyLdapPassword('reader', ''), false)
  assert.equal(binds, 0)
  await assert.rejects(verifyLdapPassword('reader', 'password'), (error: Error) => {
    assert.ok(!error.message.includes('private-directory-detail'))
    return /unavailable/.test(error.message)
  })

  let count = 0
  context.mock.method(Client.prototype, 'bind', async () => {
    if (++count === 2) throw new InvalidCredentialsError()
  })
  context.mock.method(Client.prototype, 'search', async () => ({
    searchEntries: [{ dn: 'uid=reader,dc=example' }],
    searchReferences: [],
  }))
  assert.equal(await verifyLdapPassword('reader', 'wrong'), false)
})

test('directory sessions are short and passkeys cannot bypass directory authentication', async (context) => {
  const now = Date.now()
  context.mock.method(Date, 'now', () => now)
  const session = createSession(user)

  assert.ok(session.expires > now)
  assert.ok(session.expires <= now + 15 * 60_000)

  await assert.rejects(regOptions(user), /directory password/)
  await assert.rejects(
    authPasskey(user, { id: 'missing' } as never, 'challenge'),
    /could not be verified/
  )
})

test('StartTLS starts with plain LDAP and cannot reconnect without a new TLS upgrade', () => {
  const options = ldapClientOptions(new URL('ldap://directory.example.com:389'))

  assert.equal(options.tlsOptions, undefined)
  assert.equal(options.autoRebind, false)
  assert.equal(
    ldapClientOptions(new URL('ldaps://directory.example.com:636')).tlsOptions?.rejectUnauthorized,
    true
  )
  assert.equal(
    ldapClientOptions(new URL('ldaps://directory.example.com:636')).tlsOptions?.minVersion,
    'TLSv1.2'
  )

  const connection = options.createConnection!(1, '127.0.0.1')

  connection.on('error', () => undefined)
  connection.destroy()

  assert.throws(() => options.createConnection!(1, '127.0.0.1'), /interrupted/)
})

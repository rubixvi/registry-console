import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, beforeEach, type TestContext, test } from 'node:test'
import { NextRequest } from 'next/server'
import { Client, type Entry, InvalidCredentialsError } from 'ldapts'

import { POST as login } from '../src/app/api/auth/login/route'
import { findUser, securityAccounts, securityId } from '../src/lib/auth/accounts'
import {
  authenticateDirectory,
  directoryConfig,
  refreshDirectory,
} from '../src/lib/auth/directory'
import { directoryRole } from '../src/lib/auth/directory/role'
import { createSession, resolveSession, sessionCookieName } from '../src/lib/auth/session'
import { env } from '../src/lib/config/env'
import { users } from '../src/lib/config/users'
import { database } from '../src/lib/database/client'
import { directoryRecord } from '../src/lib/database/directory'
import { hasRole } from '../src/lib/security/access'
import { encryptSecret } from '../src/lib/security/crypto'
import { AppError } from '../src/lib/security/error'
import { userSchema } from '../src/lib/validation/auth'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-directory-'))
const credential = 'h9L2v7Q4n6R8t3W5'
const admin = {
  username: 'admin',
  email: 'admin@example.com',
  role: 'admin',
  passwordHash: `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`,
}

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  ENCRYPTION_KEY: 'a'.repeat(64),
  DATA_DIR: directory,
  AUTH_USERS_JSON: JSON.stringify([admin]),
  LDAP_ENABLED: 'true',
  LDAP_URL: 'ldaps://directory.example.com:636',
  LDAP_BASE_DN: 'ou=People,dc=example,dc=com',
  LDAP_BIND_DN: 'cn=search,dc=example,dc=com',
  LDAP_BIND_PASSWORD_ENCRYPTED: 'placeholder',
  LDAP_VIEWER_GROUPS: 'cn=viewers,ou=Groups,dc=example,dc=com',
  LDAP_MEMBER_GROUPS: 'cn=members,ou=Groups,dc=example,dc=com',
  LDAP_ADMIN_GROUPS: 'cn=admins,ou=Groups,dc=example,dc=com',
})

env().LDAP_BIND_PASSWORD_ENCRYPTED = encryptSecret('search-secret')
const settings = { ...env() }

beforeEach(() => {
  Object.assign(env(), settings)
  process.env.AUTH_USERS_JSON = JSON.stringify([admin])
  for (const table of [
    'directory_users',
    'security_accounts',
    'sessions',
    'auth_requests',
    'authenticators',
    'passkeys',
    'limits',
  ])
    database().prepare(`DELETE FROM ${table}`).run()
  securityAccounts(users())
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

function mockDirectory(context: TestContext) {
  const state = {
    entry: {
      dn: 'uid=reader,ou=People,dc=example,dc=com',
      uid: 'reader',
      entryUUID: '00000000-0000-4000-8000-000000000001',
      mail: 'reader@example.com',
      memberOf: ['cn=viewers,ou=Groups,dc=example,dc=com'],
    } as Entry,
    groups: [] as Entry[],
    filters: [] as string[],
    searches: 0,
    binds: [] as string[],
    references: [] as string[],
    failure: false,
    replace: false,
  }

  context.mock.method(Client.prototype, 'startTLS', async () => undefined)
  context.mock.method(Client.prototype, 'unbind', async () => undefined)
  context.mock.method(Client.prototype, 'bind', async (dn: string, password: string) => {
    state.binds.push(String(dn))
    if (state.failure) throw new Error('private-directory-diagnostic')
    if (password !== (String(dn).startsWith('cn=search') ? 'search-secret' : credential))
      throw new InvalidCredentialsError()
    if (!String(dn).startsWith('cn=search') && state.replace)
      state.entry.entryUUID = '00000000-0000-4000-8000-000000000009'
  })
  context.mock.method(
    Client.prototype,
    'search',
    async (
      base: string,
      options: { filter: string; derefAliases: string; explicitBufferAttributes?: string[] }
    ) => {
      state.searches++
      state.filters.push(options.filter)
      assert.equal(options.derefAliases, 'never')
      return {
        searchEntries: base === env().LDAP_GROUP_BASE_DN ? state.groups : [state.entry],
        searchReferences: state.references,
      }
    }
  )

  return state
}

test('LDAP provisions unlisted accounts with directory roles and retains them across startup reconciliation', async (context) => {
  mockDirectory(context)
  const response = await login(
    new NextRequest(`${process.env.APP_ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: process.env.APP_ORIGIN!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reader', password: credential }),
    })
  )

  assert.equal(response.status, 200)
  const user = findUser('reader')!

  assert.equal(user.role, 'viewer')
  assert.equal(user.authProvider, 'ldap')
  assert.equal(user.passwordHash, undefined)
  assert.ok(!JSON.stringify(user).includes(credential))
  assert.ok(user.id)
  assert.equal(users().length, 1)
  assert.equal(resolveSession(response.cookies.get(sessionCookieName())!.value)?.username, 'reader')
  const id = securityId(user)

  securityAccounts(users())
  assert.equal(securityId(findUser('reader')!), id)
})

test('unmatched groups, invalid credentials, ambiguous identity and disabled accounts never provision', async (context) => {
  const state = mockDirectory(context)
  const original = { ...state.entry }

  assert.equal(await authenticateDirectory('reader', 'wrong'), null)
  for (const changes of [
    { memberOf: ['cn=unrelated,dc=example,dc=com'] },
    { entryUUID: '' },
    { entryUUID: ['one', 'two'] },
    { userAccountControl: '514' },
    { 'msDS-User-Account-Control-Computed': '16' },
    { accountExpires: '1' },
    { pwdAccountLockedTime: '000001010000Z' },
  ]) {
    state.entry = { ...original }
    Object.assign(state.entry, changes)
    assert.equal(await authenticateDirectory('reader', credential), null)
  }

  state.entry = original
  state.references = ['ldaps://other.example.com']
  assert.equal(await authenticateDirectory('reader', credential), null)
  assert.equal(database().prepare('SELECT COUNT(*) AS count FROM directory_users').get()!.count, 0)
})

test('directory groups grant the highest explicit role and protect configured account identities', async (context) => {
  const state = mockDirectory(context)

  state.entry.memberOf = [env().LDAP_VIEWER_GROUPS, env().LDAP_MEMBER_GROUPS]
  assert.equal((await authenticateDirectory('reader', credential))!.role, 'member')
  state.entry.memberOf = [env().LDAP_ADMIN_GROUPS, env().LDAP_MEMBER_GROUPS]
  assert.equal((await authenticateDirectory('reader', credential))!.role, 'admin')
  state.entry.uid = 'ADMIN'
  await assert.rejects(authenticateDirectory('ADMIN', credential), /configured account/)
  assert.equal(findUser('admin')!.authProvider, undefined)
  state.entry.uid = 'reader'
  state.entry.mail = 'admin@example.com'
  await assert.rejects(authenticateDirectory('reader', credential), /configured account/)

  assert.equal(
    directoryRole(['cn=admin-backup,dc=example'], {
      admin: ['cn=admin,dc=example'],
      member: [],
      viewer: [],
    }),
    null
  )
  assert.equal(
    directoryRole(['CN=Admin,DC=Example'], {
      admin: ['cn=admin,dc=example'],
      member: [],
      viewer: [],
    }),
    'admin'
  )
})

test('immutable subjects preserve factors on rename and replace them when a username is reassigned', async (context) => {
  const state = mockDirectory(context)
  const user = (await authenticateDirectory('reader', credential))!
  const id = securityId(user)

  database()
    .prepare('INSERT INTO authenticators VALUES (?, ?, ?, ?, ?)')
    .run(user.username, id, encryptSecret('JBSWY3DPEHPK3PXP'), -1, '[]')
  const old = createSession(user)

  state.entry.uid = 'renamed'
  const renamed = (await authenticateDirectory('renamed', credential))!

  assert.equal(renamed.id, user.id)
  assert.equal(securityId(renamed), id)
  assert.equal(resolveSession(old.token), null)
  assert.ok(
    database().prepare('SELECT username FROM authenticators WHERE username = ?').get('renamed')
  )

  const session = createSession(renamed)

  state.entry.entryUUID = '00000000-0000-4000-8000-000000000002'
  const replacement = (await authenticateDirectory('renamed', credential))!

  assert.notEqual(replacement.id, user.id)
  assert.notEqual(securityId(replacement), id)
  assert.equal(resolveSession(session.token), null)
  assert.equal(database().prepare('SELECT COUNT(*) AS count FROM authenticators').get()!.count, 0)
})

test('directory access is rechecked by immutable subject and revokes sessions after group changes', async (context) => {
  const state = mockDirectory(context)
  const user = (await authenticateDirectory('reader', credential))!
  const session = createSession(user)

  await refreshDirectory(user)
  assert.equal(state.searches, 2)
  database().prepare('UPDATE directory_users SET checked = 0').run()
  state.entry.memberOf = [env().LDAP_MEMBER_GROUPS]
  await Promise.all([refreshDirectory(user), refreshDirectory(user)])
  assert.equal(state.searches, 3)
  assert.equal(state.filters.at(-1), `(entryUUID=${state.entry.entryUUID})`)
  assert.equal(findUser('reader')!.role, 'member')
  assert.equal(resolveSession(session.token), null)

  const member = findUser('reader')!
  const active = createSession(member)

  state.entry.memberOf = []
  database().prepare('UPDATE directory_users SET checked = 0').run()
  await refreshDirectory(member)
  assert.equal(directoryRecord('reader')!.active, 0)
  assert.equal(findUser('reader'), undefined)
  assert.equal(resolveSession(active.token), null)
})

test('directory outages fail closed without extending the access check interval or exposing diagnostics', async (context) => {
  const state = mockDirectory(context)
  const user = (await authenticateDirectory('reader', credential))!

  database().prepare('UPDATE directory_users SET checked = 0').run()
  state.failure = true
  await assert.rejects(
    refreshDirectory(user),
    (error: unknown) =>
      error instanceof AppError &&
      error.status === 503 &&
      !error.message.includes('private-directory-diagnostic')
  )
  assert.equal(directoryRecord('reader')!.checked, 0)
  assert.equal(directoryRecord('reader')!.active, 1)
})

test('group searches escape account and DN filters and apply the configured access filter', async (context) => {
  const state = mockDirectory(context)

  env().LDAP_GROUP_BASE_DN = 'ou=Groups,dc=example,dc=com'
  env().LDAP_ACCESS_FILTER = '(!(accountStatus=disabled))'
  state.entry.memberOf = []
  state.entry.dn = 'uid=a*)(uid=*),dc=example,dc=com'
  state.groups = [{ dn: env().LDAP_MEMBER_GROUPS }]
  assert.equal((await authenticateDirectory('a*)(uid=*)', credential))!.role, 'member')
  assert.equal(state.filters[0], '(&(uid=a\\2a\\29\\28uid=\\2a\\29)(!(accountStatus=disabled)))')
  assert.equal(state.filters[1], '(member=uid=a\\2a\\29\\28uid=\\2a\\29,dc=example,dc=com)')
})

test('Active Directory binary IDs are preserved and used safely for access checks', async (context) => {
  const state = mockDirectory(context)

  env().LDAP_ID_ATTRIBUTE = 'objectGUID'
  state.entry.objectGUID = Buffer.from('0123456789abcdef0123456789abcdef', 'hex')
  const user = (await authenticateDirectory('reader', credential))!

  assert.equal(user.directory!.subject, 'b:0123456789abcdef0123456789abcdef')
  database().prepare('UPDATE directory_users SET checked = 0').run()
  await refreshDirectory(user)
  assert.equal(
    state.filters.at(-1),
    '(objectGUID=\\01\\23\\45\\67\\89\\ab\\cd\\ef\\01\\23\\45\\67\\89\\ab\\cd\\ef)'
  )
})

test('a directory identity replaced between search and password verification cannot inherit access', async (context) => {
  const state = mockDirectory(context)

  state.replace = true
  assert.equal(await authenticateDirectory('reader', credential), null)
  assert.equal(directoryRecord('reader'), undefined)
})

test('provisioning rolls back the account and security state when audit recording fails', async (context) => {
  mockDirectory(context)
  database().exec(`CREATE TRIGGER directory_audit_failure BEFORE INSERT ON audit
    WHEN NEW.action = 'security.directory.provisioned'
    BEGIN SELECT RAISE(ABORT, 'test audit failure'); END`)

  try {
    await assert.rejects(authenticateDirectory('reader', credential), /unavailable/)
    assert.equal(directoryRecord('reader'), undefined)
    assert.equal(
      database().prepare('SELECT username FROM security_accounts WHERE username = ?').get('reader'),
      undefined
    )
  } finally {
    database().exec('DROP TRIGGER directory_audit_failure')
  }
})

test('directory records cannot reserve the email of a newly configured recovery account', async (context) => {
  mockDirectory(context)
  await authenticateDirectory('reader', credential)
  process.env.AUTH_USERS_JSON = JSON.stringify([{ ...admin, email: 'reader@example.com' }])

  securityAccounts(users())
  assert.equal(directoryRecord('reader'), undefined)
  assert.equal(findUser('admin')!.email, 'reader@example.com')
  assert.equal(findUser('admin')!.authProvider, undefined)
})

test('directory policy changes invalidate sessions and roles apply across configured authentication methods', async (context) => {
  mockDirectory(context)
  const user = (await authenticateDirectory('reader', credential))!
  const session = createSession(user)
  const source = directoryConfig().source

  env().LDAP_VIEWER_GROUPS = 'cn=other,dc=example'
  assert.equal(resolveSession(session.token), null)
  env().LDAP_URL = 'ldaps://other-directory.example.com'
  assert.notEqual(directoryConfig().source, source)

  assert.equal(userSchema.parse({ ...admin, role: 'member' }).role, 'member')
  assert.equal(
    userSchema.parse({
      username: 'sso',
      email: 'sso@example.com',
      authProvider: 'sso',
      role: 'member',
    }).role,
    'member'
  )
  assert.equal(hasRole('member', 'viewer'), true)
  assert.equal(hasRole('member', 'admin'), false)
  assert.equal(hasRole('viewer', 'member'), false)
})

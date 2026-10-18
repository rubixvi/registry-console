import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { audit } from '../src/lib/database/audit'
import { database } from '../src/lib/database/client'
import { deleteRegistry } from '../src/lib/database/registry'
import { pendingScan, queueScan } from '../src/lib/database/scan'
import { transaction } from '../src/lib/database/transaction'

const directory = mkdtempSync(path.join(tmpdir(), 'registry-retention-'))

Object.assign(process.env, {
  APP_ORIGIN: 'https://console.example.com',
  DATA_DIR: directory,
  ENCRYPTION_KEY: 'a'.repeat(64),
  AUDIT_RETENTION_DAYS: '90',
})

after(() => {
  database().close()
  rmSync(directory, { recursive: true, force: true })
})

test('audit retention removes old events without evicting recent history under login spam', () => {
  const db = database()
  const insert = db.prepare('INSERT INTO audit (at, actor, action, target) VALUES (?, ?, ?, ?)')

  transaction(() => {
    insert.run(new Date(Date.now() - 91 * 86_400_000).toISOString(), 'old', 'old', '')
    insert.run(new Date().toISOString(), 'admin', 'registry.deleted', 'important')
    for (let index = 0; index < 10_100; index++) {
      insert.run(new Date().toISOString(), 'anonymous', 'login.failed', '')
    }
  })
  audit('admin', 'security.verify.success', '')

  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM audit WHERE actor = 'old'").get()!.count,
    0
  )
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM audit WHERE target = 'important'").get()!.count,
    1
  )
  assert.ok(Number(db.prepare('SELECT COUNT(*) AS count FROM audit').get()!.count) > 10_000)
})

test('removing a connection clears its scan data and deletion plans without touching other connections', () => {
  const db = database()

  for (const id of ['removed', 'kept']) {
    db.prepare(
      'INSERT INTO registries (id, name, url, username, password) VALUES (?, ?, ?, ?, ?)'
    ).run(id, id, 'https://registry.example.com', '', '')
    db.prepare('INSERT INTO image_scans VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      id,
      'complete',
      '{}',
      0,
      Date.now()
    )
    db.prepare('INSERT INTO deletion_plans VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id,
      'admin',
      id,
      'session',
      'image',
      '{}',
      Date.now() + 1000
    )
    db.prepare('INSERT INTO scan_discovery VALUES (?, ?, ?, ?, ?)').run(
      id,
      'scope',
      '{}',
      0,
      Date.now()
    )
    db.prepare(
      'INSERT INTO scan_queue (id, registry_id, repository, digest, updated) VALUES (?, ?, ?, ?, ?)'
    ).run(id, id, 'image', 'digest', Date.now())
  }

  transaction(() => deleteRegistry('removed'))
  for (const table of [
    'registries',
    'image_scans',
    'deletion_plans',
    'scan_discovery',
    'scan_queue',
  ]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count, 1, table)
  }
})

test('an admin override is selected ahead of automatic scans waiting for budget', () => {
  database().prepare('DELETE FROM scan_queue').run()
  const target = { registryId: 'kept', repository: 'image', digest: 'digest' }

  queueScan({ ...target, id: 'automatic' })
  queueScan({ ...target, id: 'admin' }, 'admin', true)

  assert.equal(pendingScan()?.id, 'admin')
})

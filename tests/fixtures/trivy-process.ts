import assert from 'node:assert/strict'

import { pendingScan, scanDelay } from '../../src/lib/database/scan'
import { nextDiscovery } from '../../src/lib/database/scan-discovery'
import { getRegistry } from '../../src/lib/registry/store'
import { prepareScan, scanStatus } from '../../src/lib/registry/trivy'
import { AppError } from '../../src/lib/security/error'

const [action, timestamp, id, digest] = process.argv.slice(2)
const clock = Number(timestamp)

assert.ok(Number.isFinite(clock))

Date.now = () => clock

switch (action) {
  case 'delay':
    console.log(scanDelay())
    break

  case 'status':
    console.log(
      JSON.stringify({
        report: scanStatus(getRegistry(id), 'team/app', digest).report,
        pending: pendingScan(),
      })
    )
    break

  case 'discovery':
    console.log(nextDiscovery()!.value)
    break

  case 'claim':
    try {
      const job = prepareScan(getRegistry(id), 'team/app', digest, 'admin')
      console.log(job.started ? 'claimed' : 'running')
    } catch (error) {
      if (!(error instanceof AppError)) throw error

      console.log(String(error.status))
    }
    break

  default:
    throw new Error('Unknown scan test action.')
}

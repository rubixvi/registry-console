import 'server-only'

import { randomUUID } from 'node:crypto'

import { env } from '@/lib/config/env'
import {
  claimDiscovery,
  discardScan,
  getScan,
  pendingScan,
  releaseDiscovery,
  renewDiscovery,
  scanDelay,
} from '@/lib/database/scan'
import {
  discardDiscovery,
  nextDiscovery,
  pauseDiscovery,
  registerDiscovery,
} from '@/lib/database/scan-discovery'
import { getRegistries, getRegistry, seedRegistry } from '@/lib/registry/store'
import { matchesScan, needsScan, runScan, startScan } from '@/lib/registry/trivy'
import { discoverRegistry, discoveryScope } from '@/lib/registry/trivy-discovery'
import { AppError } from '@/lib/security/error'
import { type ScanTarget } from '@/types/scan'

const INTERVAL = 60_000

const worker = globalThis as typeof globalThis & {
  trivyTimer?: ReturnType<typeof setTimeout>
}

export async function scanPending(reference?: ScanTarget): Promise<void> {
  if (env().TRIVY_ENABLED !== 'true') return

  const owner = randomUUID()

  if (!claimDiscovery(owner)) return

  let active = true
  const heartbeat = setInterval(() => {
    try {
      active = active && renewDiscovery(owner)
    } catch {
      active = false
    }
  }, 30_000)
  const enabled = () => active && env().TRIVY_ENABLED === 'true'

  heartbeat.unref()

  try {
    if (!enabled() || scanDelay() > 0) return

    if (!reference) {
      seedRegistry()

      const connections = getRegistries()
      const ids = new Set(connections.map((registry) => registry.id))

      for (const connection of connections) {
        try {
          const registry = getRegistry(connection.id)

          registerDiscovery(registry.id, discoveryScope(registry))
        } catch {
          continue
        }
      }

      const discovery = nextDiscovery()

      if (discovery && enabled()) {
        if (!ids.has(discovery.id)) {
          discardDiscovery(discovery.id)
        } else {
          try {
            await discoverRegistry(
              getRegistry(discovery.id),
              discovery.scope,
              discovery.value,
              enabled
            )
          } catch (error) {
            pauseDiscovery(
              discovery.id,
              discovery.scope,
              error instanceof AppError && error.retryAfter ? error.retryAfter * 1000 : 15 * 60_000
            )
            console.error('Trivy discovery paused.', {
              registry: discovery.id,
              status: error instanceof AppError ? error.status : 500,
            })
          }
        }
      }
    }

    if (!enabled() || scanDelay() > 0) return

    const target = reference ?? pendingScan()

    if (!target) return

    try {
      const registry = getRegistry(target.registryId)

      if (!matchesScan(registry, target.repository, target.digest, target.id)) {
        discardScan(target.id)
        return
      }

      if (!needsScan(registry, target.repository, target.digest)) {
        if (getScan(target.id)?.status === 'complete') discardScan(target.id)
        return
      }

      const job = await startScan(registry, target.repository, target.digest, 'system:trivy')

      if (job) await runScan(job)
    } catch (error) {
      if (error instanceof AppError && (error.status === 409 || error.status === 429)) return

      discardScan(target.id)
      console.error('Trivy queued scan could not start.', {
        registry: target.registryId,
        status: error instanceof AppError ? error.status : 500,
      })
    }
  } finally {
    clearInterval(heartbeat)
    releaseDiscovery(owner)
  }
}

export function startScanWorker(): void {
  if (env().TRIVY_ENABLED !== 'true' || worker.trivyTimer) return

  async function tick(): Promise<void> {
    try {
      await scanPending()
    } catch {
      console.error('Trivy background processing failed. It will retry automatically.')
    } finally {
      worker.trivyTimer = setTimeout(tick, INTERVAL)
      worker.trivyTimer.unref()
    }
  }

  worker.trivyTimer = setTimeout(tick, 10_000)
  worker.trivyTimer.unref()
}

import 'server-only'

import { saveDiscovery } from '@/lib/database/scan-discovery'
import { registryPage } from '@/lib/registry/catalog'
import { registryIdentity } from '@/lib/registry/identity'
import { imageDigest } from '@/lib/registry/image-digest'
import { getRegistry } from '@/lib/registry/store'
import { scheduleScan } from '@/lib/registry/trivy'
import { AppError } from '@/lib/security/error'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { cursorSchema } from '@/lib/validation/scan'
import { type RegistryRecord } from '@/types/registry'
import { type ScanCursor } from '@/types/scan'

const INTERVAL = 15 * 60_000
const BATCH = 10

export function discoveryScope(registry: RegistryRecord): string {
  return keyedFingerprint('trivy-discovery', registryIdentity(registry))
}

export async function discoverRegistry(
  registry: RegistryRecord,
  scope: string,
  value: string,
  active: () => boolean
): Promise<void> {
  let state: ScanCursor

  try {
    state = cursorSchema.parse(JSON.parse(value))
  } catch {
    state = cursorSchema.parse({})
  }

  let inspected = 0

  try {
    for (let operations = 0; operations < 30 && inspected < BATCH && active(); operations++) {
      const current = getRegistry(registry.id)

      if (discoveryScope(current) !== scope) return

      if (!state.repository) {
        if (!state.repositories.length) {
          if (state.catalogue === null) {
            saveDiscovery(registry.id, scope, {}, INTERVAL)
            return
          }

          if (state.pages >= 200) {
            throw new AppError(413, 'Scan discovery exceeded the repository page limit.')
          }

          const page = await registryPage(current, { last: state.catalogue, n: 100 }, true)

          if (!active()) return

          if (page.next !== null && page.next === state.catalogue) {
            throw new AppError(502, 'Registry returned a repeated repository cursor.')
          }

          state.repositories = page.items
          state.catalogue = page.next
          state.pages++
        }

        state.repository = state.repositories.shift() ?? ''
        state.cursor = ''
        state.tagPages = 0
      } else if (state.tags.length) {
        const tag = state.tags[0]

        try {
          const digest = await imageDigest(current, state.repository, tag)

          if (!active() || discoveryScope(getRegistry(registry.id)) !== scope) return
          if (!scheduleScan(current, state.repository, digest)) {
            saveDiscovery(registry.id, scope, state, INTERVAL)
            return
          }
        } catch (error) {
          if (error instanceof AppError && error.status === 429) throw error

          console.error('Trivy digest discovery failed.', {
            registry: registry.id,
            status: error instanceof AppError ? error.status : 500,
          })
        }

        state.tags.shift()
        inspected++
      } else if (state.cursor !== null) {
        if (state.tagPages >= 200) {
          throw new AppError(413, 'Scan discovery exceeded the tag page limit.')
        }

        const page = await registryPage(
          current,
          {
            repository: state.repository,
            last: state.cursor,
            n: 100,
          },
          true
        )

        if (!active()) return

        if (page.next !== null && page.next === state.cursor) {
          throw new AppError(502, 'Registry returned a repeated tag cursor.')
        }

        state.tags = page.items
        state.cursor = page.next
        state.tagPages++
      } else {
        state.repository = ''
      }

      saveDiscovery(registry.id, scope, state, 60_000)
    }
  } catch (error) {
    const delay =
      error instanceof AppError && error.retryAfter
        ? Math.min(24 * 60 * 60_000, error.retryAfter * 1000)
        : INTERVAL

    saveDiscovery(
      registry.id,
      scope,
      error instanceof AppError && error.status === 413 ? {} : state,
      delay
    )
    throw error
  }
}

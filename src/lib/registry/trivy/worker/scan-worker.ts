import 'server-only'

import { env } from '@/lib/config/env'
import { tick, worker } from '@/lib/registry/trivy/worker'

export function scanWorker(): void {
  if (env().TRIVY_ENABLED !== 'true' || worker.trivyTimer) return

  worker.trivyTimer = setTimeout(tick, 10_000)
  worker.trivyTimer.unref()
}

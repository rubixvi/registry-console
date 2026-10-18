import 'server-only'

import { env } from '@/lib/config/env'
import { worker } from '@/lib/registry/trivy-worker/state'
import { tick } from '@/lib/registry/trivy-worker/tick'

export function startScanWorker(): void {
  if (env().TRIVY_ENABLED !== 'true' || worker.trivyTimer) return

  worker.trivyTimer = setTimeout(tick, 10_000)
  worker.trivyTimer.unref()
}

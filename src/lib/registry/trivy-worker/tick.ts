import 'server-only'

import { INTERVAL } from '@/lib/registry/trivy-worker/constants'
import { scanPending } from '@/lib/registry/trivy-worker/scan-pending'
import { worker } from '@/lib/registry/trivy-worker/state'

export async function tick(): Promise<void> {
  try {
    await scanPending()
  } catch {
    console.error('Trivy background processing failed. It will retry automatically.')
  } finally {
    worker.trivyTimer = setTimeout(tick, INTERVAL)
    worker.trivyTimer.unref()
  }
}

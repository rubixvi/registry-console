import 'server-only'

import { INTERVAL, scanPending, worker } from '@/lib/registry/trivy/worker'

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

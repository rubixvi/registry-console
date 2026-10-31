import 'server-only'

import { type ScanReport } from '@/types/scan'

export function emptyReport(digest: string): ScanReport {
  return {
    digest,
    scannedAt: new Date().toISOString(),
    counts: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      UNKNOWN: 0,
    },
    platforms: [],
    vulnerabilities: [],
    truncated: false,
  }
}

import { type z } from 'zod'

import { type cursorSchema } from '@/lib/validation/scan'

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const

export type Severity = (typeof SEVERITIES)[number]
export type Status = 'not-scanned' | 'running' | 'complete' | 'failed'

export type Vulnerability = {
  id: string
  package: string
  installed: string
  fixed: string
  severity: Severity
  title: string
  target: string
  platform: string
}

export type ScanReport = {
  digest: string
  scannedAt: string
  counts: Record<Severity, number>
  platforms: string[]
  vulnerabilities: Vulnerability[]
  truncated: boolean
}

export type ScanStatus = {
  enabled: boolean
  status: Status
  report?: ScanReport
  error?: string
  retryAfter?: number
}

export type ScanTarget = {
  id: string
  registryId: string
  repository: string
  digest: string
}

export type ScanJob = ScanTarget & {
  actor: string
  expires: number
}

export type ScanClaim = ScanJob & {
  override?: boolean
}

export type ScanRow = {
  status: ScanStatus['status']
  value: string
  expires: number
}

export type DiscoveryRow = {
  id: string
  scope: string
  value: string
}

export type ScanCursor = z.infer<typeof cursorSchema>

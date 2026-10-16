export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const

export type Severity = (typeof SEVERITIES)[number]

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
  status: 'not-scanned' | 'running' | 'complete' | 'failed'
  report?: ScanReport
  error?: string
}

export type ScanTarget = {
  id: string
  registryId: string
  repository: string
  digest: string
}

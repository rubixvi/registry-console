import { z } from 'zod'

import { type ScanReport, SEVERITIES } from '@/types/scan'

const vulnerability = z.object({
  VulnerabilityID: z.string().max(256),
  PkgName: z.string().max(1024),
  InstalledVersion: z.string().max(1024),
  FixedVersion: z.string().max(1024).default(''),
  Severity: z.enum(SEVERITIES).catch('UNKNOWN'),
  Title: z.string().max(4096).default(''),
})

const outputSchema = z.object({
  SchemaVersion: z.literal(2),
  Results: z
    .array(
      z.object({
        Target: z.string().max(2048),
        Vulnerabilities: z.array(vulnerability).max(50_000).optional(),
      })
    )
    .max(1000)
    .optional(),
})

export function emptyReport(digest: string): ScanReport {
  return {
    digest,
    scannedAt: new Date().toISOString(),
    counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
    platforms: [],
    vulnerabilities: [],
    truncated: false,
  }
}

export function appendTrivyReport(report: ScanReport, raw: unknown, platform: string): void {
  const output = outputSchema.parse(raw)

  report.platforms.push(platform)

  for (const result of output.Results ?? []) {
    for (const entry of result.Vulnerabilities ?? []) {
      report.counts[entry.Severity]++

      if (report.vulnerabilities.length >= 1000) {
        report.truncated = true
        continue
      }

      report.vulnerabilities.push({
        id: entry.VulnerabilityID,
        package: entry.PkgName.slice(0, 256),
        installed: entry.InstalledVersion.slice(0, 256),
        fixed: entry.FixedVersion.slice(0, 256),
        severity: entry.Severity,
        title: entry.Title.slice(0, 512),
        target: result.Target.slice(0, 512),
        platform,
      })
    }
  }
}

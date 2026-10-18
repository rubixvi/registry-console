import { outputSchema } from '@/lib/validation/response/trivy'
import { type ScanReport } from '@/types/scan'

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

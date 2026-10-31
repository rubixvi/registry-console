import 'server-only'

import { outputSchema } from '@/lib/validation/response/trivy'
import { type ScanReport } from '@/types/scan'

export function appendReport(report: ScanReport, raw: unknown, platform: string): void {
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

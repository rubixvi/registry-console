'use client'

import { ShieldCheck } from 'lucide-react'

import { CompactScan } from '@/components/registry/security/compact'
import { Counts } from '@/components/registry/security/counts'
import { ScanTable } from '@/components/registry/security/table'
import { Button } from '@/components/ui/button'
import { useScan } from '@/hooks/registry/use-scan'

type Props = {
  id: string
  repository: string
  digest: string
  admin?: boolean
  compact?: boolean
}

export function ImageScan({ id, repository, digest, admin = false, compact = false }: Props) {
  const { data, error, busy, scan } = useScan(id, repository, digest)

  if (error) {
    return <span className="text-xs text-muted-foreground">Scan status unavailable</span>
  }

  if (!data?.enabled) return null

  const report = data.report
  const limited = (data.retryAfter ?? 0) > 0
  const total = report ? Object.values(report.counts).reduce((sum, count) => sum + count, 0) : 0
  const summary =
    data.status === 'running'
      ? 'Scan running…'
      : data.status === 'failed'
        ? 'Scan failed'
        : report
          ? `${total} vulnerabilities - ${report.counts.CRITICAL} critical - ${report.counts.HIGH} high`
          : 'Not scanned'

  if (compact) {
    return <CompactScan data={data} summary={summary} total={total} />
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
          Vulnerabilities
        </h2>

        {admin && data.status !== 'complete' && (
          <Button
            disabled={busy || data.status === 'running'}
            onClick={() => scan(limited)}
            type="button"
            variant="outline"
          >
            {data.status === 'running' ? 'Scanning…' : 'Scan'}
          </Button>
        )}
      </div>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {summary}
      </p>

      {limited && (
        <p className="text-sm text-muted-foreground">
          The scan limit has been reached. Automatic scanning will resume when capacity is
          available.
        </p>
      )}

      {data.error && <p className="text-sm text-destructive">{data.error}</p>}

      {report && (
        <>
          <div className="flex flex-wrap gap-2">
            <Counts compact={true} counts={report.counts} />
          </div>

          <p className="break-all text-xs text-muted-foreground">
            Scanned {report.scannedAt} - {report.platforms.join(', ')}
          </p>

          <p className="break-all font-mono text-xs text-muted-foreground">{report.digest}</p>

          <ScanTable vulnerabilities={report.vulnerabilities} />

          {report.truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the first 1,000 findings. Severity totals include every finding reported by
              Trivy.
            </p>
          )}
        </>
      )}
    </section>
  )
}

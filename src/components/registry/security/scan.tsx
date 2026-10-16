'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'

import { CompactScan } from '@/components/registry/security/compact'
import { Counts } from '@/components/registry/security/counts'
import { ScanTable } from '@/components/registry/security/table'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/http/client'
import { type ScanStatus } from '@/types/scan'

type Props = {
  id: string
  repository: string
  digest: string
  admin?: boolean
  compact?: boolean
}

export function ImageScan({ id, repository, digest, admin = false, compact = false }: Props) {
  const [busy, setBusy] = useState(false)
  const params = new URLSearchParams({ repository, digest })
  const scanEndpoint = `/api/registries/${encodeURIComponent(id)}/scan`
  const endpoint = `${scanEndpoint}?${params}`

  const { data, error, mutate } = useSWR<ScanStatus>(endpoint, apiRequest<ScanStatus>, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 10_000,
    refreshInterval: (current) => (current?.status === 'running' ? 3000 : 0),
  })

  async function scan(): Promise<void> {
    if (busy || data?.status === 'running') return

    setBusy(true)

    try {
      const result = await apiRequest<ScanStatus>(scanEndpoint, {
        method: 'POST',
        body: JSON.stringify({ repository, digest }),
      })

      await mutate(result, { revalidate: false })
      toast.success('Vulnerability scan started.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to start the scan.')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return <span className="text-xs text-muted-foreground">Scan status unavailable</span>
  }

  if (!data?.enabled) return null

  const report = data.report
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
            onClick={scan}
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

          <p className="text-xs text-muted-foreground">
            Counts include findings on each scanned platform.
          </p>
        </>
      )}
    </section>
  )
}

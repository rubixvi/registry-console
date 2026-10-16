import { Counts } from '@/components/registry/security/counts'
import { type ScanStatus } from '@/types/scan'

type Props = {
  data: ScanStatus
  summary: string
  total: number
}

export function CompactScan({ data, summary, total }: Props) {
  const report = data.report

  if (data.status === 'running' || data.status === 'failed' || !report) {
    return (
      <span className="basis-full text-xs text-muted-foreground" role="status" title={data.error}>
        {summary}
      </span>
    )
  }

  return (
    <span className="flex basis-full flex-wrap items-center gap-1">
      <span className="sr-only">{total} vulnerabilities. </span>
      <Counts compact counts={report.counts} />
    </span>
  )
}

import { styles } from '@/components/registry/security/styles'
import { Badge } from '@/components/ui/badge'
import { type ScanReport, SEVERITIES } from '@/types/scan'

type Props = {
  counts: ScanReport['counts']
  compact?: boolean
}

export function Counts({ counts, compact = false }: Props) {
  return (
    <>
      {SEVERITIES.map((severity) => (
        <Badge
          className={`${styles[severity]} py-0 px-1.5 sm:py-0.5 sm:px-2 tabular-nums`}
          key={severity}
          title={`${severity} · ${counts[severity]}`}
          variant="outline"
        >
          {!compact && <span>{severity}</span>}
          <span className="font-semibold text-xs">{counts[severity]}</span>
          {compact && <span className="sr-only"> {severity.toLowerCase()} vulnerabilities</span>}
        </Badge>
      ))}
    </>
  )
}

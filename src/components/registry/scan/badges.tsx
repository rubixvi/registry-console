import { styles } from '@/components/registry/security/styles'
import { Badge } from '@/components/ui/badge'
import { type Severity } from '@/types/scan'

type Props = {
  severity: Severity
}

export function SeverityBadge({ severity }: Props) {
  return (
    <Badge className={styles[severity]} variant="outline">
      {severity}
    </Badge>
  )
}

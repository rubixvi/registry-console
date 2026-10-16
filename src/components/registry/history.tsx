import { History as HistoryIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { type HistoryEntry, type ImageLabel } from '@/types/image'
import { formatBytes } from '@/utils/format-bytes'

type Props = {
  entries: HistoryEntry[]
  labels: ImageLabel[]
}

export function ImageHistory({ entries, labels }: Props) {
  const steps = [...entries].reverse()

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <HistoryIcon aria-hidden="true" className="size-4 text-primary" />
          History
        </h2>

        <p className="mt-1 text-xs text-muted-foreground">
          Build steps. Sizes refer to compressed layers.
        </p>
      </div>

      {labels.length > 0 && (
        <dl className="grid gap-4 border-b p-5 text-sm">
          {labels.map((label) => (
            <div className="space-y-1" key={label.name}>
              <dt className="break-all font-mono text-xs text-muted-foreground">{label.name}</dt>

              <dd className="whitespace-pre-wrap break-all">{label.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {steps.length > 0 ? (
        <ol className="max-h-160 divide-y overflow-auto">
          {steps.map((entry) => (
            <li className="space-y-3 p-5" key={entry.step}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Step {entry.step}
                  {entry.created ? ` · ${entry.created}` : ''}
                </span>

                {entry.emptyLayer ? (
                  <Badge>Metadata</Badge>
                ) : (
                  <span>{entry.size === null ? 'Size not provided' : formatBytes(entry.size)}</span>
                )}
              </div>

              <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-6 whitespace-pre-wrap break-all">
                {entry.command}
              </pre>

              {(entry.author || entry.comment) && (
                <p className="text-xs leading-6 text-muted-foreground">
                  {[entry.author, entry.comment].filter(Boolean).join(' · ')}
                </p>
              )}

              {entry.digest && (
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                  {entry.digest}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">
          This image does not include build history.
        </p>
      )}
    </section>
  )
}

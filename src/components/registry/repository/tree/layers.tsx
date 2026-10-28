'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Layers3 } from 'lucide-react'

import { formatBytes } from '@/utils/format-bytes'

export type ImageLayer = {
  digest?: string
  size?: number | null
}

type Props = {
  layers: ImageLayer[]
}

const PAGE_SIZE = 20

export function Layers({ layers }: Props) {
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)

  if (layers.length === 0) return null

  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-3 top-4.75 h-px w-3 bg-border"
      />

      <div className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60">
        <button
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} image layers`}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? (
            <ChevronDown aria-hidden="true" className="size-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" />
          )}
        </button>

        <Layers3 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />

        <button
          className="text-left text-sm hover:text-primary"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          Layers ({layers.length})
        </button>
      </div>

      {open && (
        <ul
          aria-label="Image layers"
          className={[
            'ml-4.75 pl-3',
            '[&>ul>li]:before:pointer-events-none',
            '[&>ul>li]:before:absolute',
            '[&>ul>li]:before:-left-3',
            '[&>ul>li]:before:top-0',
            '[&>ul>li]:before:bottom-0',
            '[&>ul>li]:before:w-px',
            '[&>ul>li]:before:bg-border/70',
            '[&>ul>li:last-child]:before:bottom-auto',
            '[&>ul>li:last-child]:before:h-4.75',
          ].join(' ')}
        >
          {layers.slice(0, limit).map((layer, index) => (
            <li className="relative" key={`${layer.digest ?? 'layer'}-${index}`}>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-3 top-4.75 h-px w-3 bg-border"
              />

              <div className="flex min-h-8 min-w-0 items-center gap-2 px-2 py-1">
                <span aria-hidden="true" className="size-6 shrink-0" />
                <Layers3 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />

                <code className="min-w-0 truncate text-xs" title={layer.digest}>
                  {layer.digest ? `${layer.digest.slice(0, 19)}…` : `Layer ${index + 1}`}
                </code>

                {typeof layer.size === 'number' && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(layer.size)}
                  </span>
                )}
              </div>
            </li>
          ))}

          {layers.length > limit && (
            <li className="py-1 pl-2">
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
                type="button"
              >
                Show more layers ({layers.length - limit} remaining)
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

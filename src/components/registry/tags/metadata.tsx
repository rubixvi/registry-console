'use client'

import { type ReactNode } from 'react'

import { ImageScan } from '@/components/registry/security/scan'
import { useMetadata } from '@/hooks/registry/use-metadata'

type Props = {
  id: string
  repository: string
  reference: string
  trivyEnabled?: boolean
  children?: ReactNode
}

export function Metadata({ id, repository, reference, trivyEnabled, children }: Props) {
  const { container, data, error } = useMetadata(id, repository, reference)

  return (
    <div
      className="grid min-w-0 flex-1 grid-cols-1 items-center gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4 truncate"
      ref={container}
    >
      <div className="min-w-0 space-y-1 truncate">
        {children}

        <div className="text-xs text-muted-foreground">
          {error ? (
            <span title={error.message}>Metadata unavailable</span>
          ) : !data ? (
            <span>Loading image details…</span>
          ) : data.created ? (
            <time dateTime={data.created}>
              {new Date(data.created).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          ) : null}
        </div>
      </div>

      {trivyEnabled && data && !error && (
        <div className="flex min-w-0 items-center justify-start text-xs sm:justify-end">
          <ImageScan compact digest={data.digest} id={id} repository={repository} />
        </div>
      )}
    </div>
  )
}

'use client'

import { useMetadata } from '@/hooks/registry/use-metadata'
import { formatBytes } from '@/utils/format-bytes'

type Props = {
  id: string
  repository: string
  reference: string
}

export function Metadata({ id, repository, reference }: Props) {
  const { container, data, error } = useMetadata(id, repository, reference)
  const multiple = (data?.platformDetails.length ?? 0) > 1

  return (
    <div
      className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      ref={container}
    >
      {error ? (
        <span title={error.message}>Metadata unavailable</span>
      ) : !data ? (
        <span>Loading image details…</span>
      ) : (
        <>
          <span>
            {multiple ? 'Latest reported build' : 'Created'}{' '}
            {data.created ? (
              <time dateTime={data.created}>
                {data.created.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')}
              </time>
            ) : (
              'not provided'
            )}
          </span>
          <span
            title={multiple ? 'Total across platforms, with shared blobs counted once.' : undefined}
          >
            {multiple ? 'Total compressed size' : 'Compressed size'} {formatBytes(data.size)}
          </span>
        </>
      )}
    </div>
  )
}

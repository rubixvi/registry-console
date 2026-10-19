'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { useResource } from '@/hooks/shared/use-resource'
import { type RegistryPage } from '@/types/registry'
import { tagLabel } from '@/utils/tag-label'

type Props = {
  id: string
  repository: string
}

export function Tags({ id, repository }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  const params = new URLSearchParams({ repository, n: '100' })
  const endpoint = `/api/registries/${encodeURIComponent(id)}/tags?${params}`

  const state = useResource<RegistryPage>(visible ? endpoint : null)
  const preview = state.data?.items.slice(0, 5) ?? []
  const registryPath = `/registries/${encodeURIComponent(id)}`

  useEffect(() => {
    const element = container.current

    if (!element) {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-w-0" ref={container}>
      {state.error ? (
        <p className="text-xs text-muted-foreground" role="status" title={state.error.message}>
          Tags unavailable
        </p>
      ) : !state.data ? (
        <p className="text-xs text-muted-foreground">Loading tags…</p>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {preview.map((tag) => (
            <Badge asChild className="min-w-0 max-w-full" key={tag} variant="secondary">
              <Link
                aria-label={`Inspect ${repository}:${tag}`}
                className="block truncate"
                href={{
                  pathname: registryPath,
                  query: { repository, reference: tag },
                }}
                title={tag}
              >
                {tagLabel(tag)}
              </Link>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

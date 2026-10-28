'use client'

import { useState } from 'react'
import { Tag as TagIcon } from 'lucide-react'

import { ImageTag } from '@/components/registry/repository/tree/tag'
import { Button } from '@/components/ui/button'
import { useRegistryPage } from '@/hooks/registry/use-page'

const PAGE_SIZE = 50

type Props = {
  id: string
  repository: string
}

export function RepositoryTags({ id, repository }: Props) {
  const state = useRegistryPage(id, repository)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const tags = state.data?.items ?? []

  if (state.isLoading && !state.data) {
    return (
      <p className="px-2 py-2 text-xs text-muted-foreground" role="status">
        Loading image tags…
      </p>
    )
  }

  if (state.error) {
    return (
      <div className="px-2 py-2 text-xs text-destructive" role="alert">
        Could not load tags. {state.error.message}{' '}
        <Button onClick={() => void state.refresh()} size="sm" type="button" variant="outline">
          Retry
        </Button>
      </div>
    )
  }

  if (tags.length === 0) {
    return <p className="px-2 py-2 text-xs text-muted-foreground">No image tags found.</p>
  }

  return (
    <ul aria-label={`Image tags for ${repository}`}>
      {tags.slice(0, limit).map((tag) => (
        <ImageTag id={id} key={tag} repository={repository} tag={tag} />
      ))}

      {tags.length > limit && (
        <li className="py-1 pl-2">
          <Button
            onClick={() => setLimit((current) => current + PAGE_SIZE)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <TagIcon aria-hidden="true" className="size-3.5" />
            Show more tags ({tags.length - limit} remaining)
          </Button>
        </li>
      )}
    </ul>
  )
}

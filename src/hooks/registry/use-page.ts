'use client'

import { type ChangeEvent, useState } from 'react'

import { useResource } from '@/hooks/shared/use-resource'
import { apiRequest } from '@/lib/http/client'
import { sortTags, type TagOrder } from '@/utils/tag-order'

const PAGE_SIZE = 100

export function useRegistryPage(id: string, repository?: string, order: TagOrder = 'natural-asc') {
  const [index, setIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<Error>()
  const params = new URLSearchParams()

  if (repository) params.set('repository', repository)

  const endpoint = `/api/registries/${encodeURIComponent(id)}/browse?${params}`
  const resource = useResource<{ items: string[] }>(endpoint)
  const search = query.toLowerCase()
  const matches = resource.data?.items.filter((item) => item.toLowerCase().includes(search)) ?? []
  const sorted = repository ? sortTags(matches, order) : matches.sort()
  const maximum = Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1)
  const current = Math.min(index, maximum)
  const items = sorted.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  function changeQuery(event: ChangeEvent<HTMLInputElement>): void {
    setQuery(event.target.value)
    setIndex(0)
  }

  function resetPage(): void {
    setIndex(0)
  }

  function next(): void {
    setIndex(Math.min(current + 1, maximum))
  }

  function previous(): void {
    setIndex(Math.max(0, current - 1))
  }

  async function refresh(): Promise<void> {
    if (refreshing) return

    setRefreshing(true)
    setRefreshError(undefined)

    try {
      const data = await apiRequest<{ items: string[] }>(endpoint, {
        headers: { 'Cache-Control': 'no-cache' },
      })

      await resource.mutate(data, { revalidate: false })
    } catch (error) {
      setRefreshError(error instanceof Error ? error : new Error('Unable to refresh the listing.'))
    } finally {
      setRefreshing(false)
    }
  }

  return {
    ...resource,
    error: refreshError ?? resource.error,
    isValidating: refreshing || resource.isValidating,
    next,
    previous,
    refresh,
    resetPage,
    query,
    changeQuery,
    page: current + 1,
    hasPrevious: current > 0,
    hasNext: current < maximum,
    items,
    matches: sorted,
  }
}

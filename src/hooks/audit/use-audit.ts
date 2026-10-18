'use client'

import { type SyntheticEvent, useState } from 'react'

import { useResource } from '@/hooks/shared/use-resource'
import { type AuditFilters, type AuditPage } from '@/types/audit'

const EMPTY_FILTERS: AuditFilters = {
  actor: '',
  action: '',
  query: '',
  from: '',
  to: '',
}

export function useAudit() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS)
  const [before, setBefore] = useState(0)
  const [history, setHistory] = useState<number[]>([])

  const params = new URLSearchParams({
    ...filters,
    before: String(before),
    n: '20',
  })

  const resource = useResource<AuditPage>(`/api/audit?${params}`)

  function apply(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()

    const data = new FormData(event.currentTarget)

    setFilters({
      actor: String(data.get('actor') ?? '').trim(),
      action: String(data.get('action') ?? '').trim(),
      query: String(data.get('query') ?? '').trim(),
      from: String(data.get('from') ?? ''),
      to: String(data.get('to') ?? ''),
    })
    setBefore(0)
    setHistory([])
  }

  function clear(): void {
    setFilters(EMPTY_FILTERS)
    setBefore(0)
    setHistory([])
  }

  function next(): void {
    if (!resource.data?.next) return

    setHistory([...history, before])
    setBefore(resource.data.next)
  }

  function previous(): void {
    const cursor = history[history.length - 1]

    if (cursor === undefined) return

    setBefore(cursor)
    setHistory(history.slice(0, -1))
  }

  function refresh(): void {
    void resource.mutate()
  }

  return {
    ...resource,
    apply,
    clear,
    next,
    previous,
    refresh,
    page: history.length + 1,
    hasPrevious: history.length > 0,
  }
}

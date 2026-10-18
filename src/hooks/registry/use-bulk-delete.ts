'use client'

import { type KeyboardEvent, type MouseEvent, useRef, useState } from 'react'
import { toast } from 'sonner'

import { apiRequest } from '@/lib/http/client'
import { type BulkDeletionResult, type DeletionPlan } from '@/types/deletion'
import { selectTags } from '@/utils/tag-selection'

export function useBulkDelete(
  id: string,
  repository: string,
  scope: string,
  tags: string[],
  refresh: () => void | Promise<void>
) {
  const [selection, setSelection] = useState<{ scope: string; tags: string[] }>({ scope, tags: [] })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [plan, setPlan] = useState<DeletionPlan | null>(null)
  const [result, setResult] = useState<BulkDeletionResult | null>(null)
  const anchor = useRef<{ scope: string; tag: string } | null>(null)

  const selected =
    selection.scope === scope ? selection.tags.filter((tag) => tags.includes(tag)) : []
  const endpoint = `/api/registries/${encodeURIComponent(id)}/bulk`

  function toggle(tag: string, range = false): void {
    if (busy || open) return

    const previous = range && anchor.current?.scope === scope ? anchor.current.tag : null

    setSelection({ scope, tags: selectTags(tags, selected, tag, previous) })
    anchor.current = { scope, tag }
  }

  function selectPage(event: KeyboardEvent<HTMLElement>): void {
    if (busy || open || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') return

    const target = event.target

    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return

    event.preventDefault()
    setSelection({ scope, tags: [...tags] })
    anchor.current = null
  }

  function toggleAll(): void {
    if (busy || open) return

    anchor.current = null
    setSelection({
      scope,
      tags: selected.length === tags.length ? [] : [...tags],
    })
  }

  function changeOpen(value: boolean): void {
    if (busy) return

    setOpen(value)

    if (!value) {
      setPlan(null)
      setResult(null)
      setError('')
      setConfirmation('')
    }
  }

  async function prepare(): Promise<void> {
    if (busy || !selected.length) return

    setOpen(true)
    setBusy(true)
    setPlan(null)
    setResult(null)
    setError('')
    setConfirmation('')

    try {
      setPlan(
        await apiRequest<DeletionPlan>(endpoint, {
          method: 'POST',
          body: JSON.stringify({ repository, tags: selected }),
        })
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to preview the selected tags.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(event: MouseEvent): Promise<void> {
    event.preventDefault()

    if (busy || !plan || confirmation !== repository) return

    setBusy(true)
    setError('')

    try {
      const result = await apiRequest<BulkDeletionResult>(endpoint, {
        method: 'DELETE',
        body: JSON.stringify({ planId: plan.id, confirmation }),
      })

      if (result.failed > 0) {
        toast.warning(`${result.deleted} manifests deleted. ${result.failed} failed.`)
      } else {
        toast.success(`${result.deleted} manifests deleted.`)
      }

      setResult(result)
      setSelection({ scope, tags: [] })
      await refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Bulk deletion failed.')
    } finally {
      setBusy(false)
    }
  }

  return {
    selected,
    toggle,
    toggleAll,
    selectPage,
    open,
    changeOpen,
    busy,
    error,
    confirmation,
    setConfirmation,
    plan,
    result,
    prepare,
    remove,
  }
}

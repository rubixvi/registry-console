'use client'

import Link from 'next/link'
import { ArrowRight, RefreshCw, Search, Tag as TagIcon } from 'lucide-react'
import { useSWRConfig } from 'swr'

import { BulkDeleteDialog } from '@/components/registry/bulk-delete'
import { Controls } from '@/components/registry/controls'
import { Metadata } from '@/components/registry/metadata'
import { ErrorMessage } from '@/components/shared/error-message'
import { Loading } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBulkDelete } from '@/hooks/registry/use-bulk-delete'
import { useTagOrder } from '@/hooks/registry/use-order'
import { useRegistryPage } from '@/hooks/registry/use-page'
import { type TagOrder } from '@/utils/tag-order'

type Props = {
  id: string
  repository: string
  admin: boolean
  readOnly: boolean
  defaultOrder: TagOrder
}

export function Tag({ id, repository, admin, readOnly, defaultOrder }: Props) {
  const ordering = useTagOrder(defaultOrder)
  const state = useRegistryPage(id, repository, ordering.order)
  const { mutate } = useSWRConfig()

  const scope = `${id}/${repository}/${ordering.order}/${state.query}/${state.page}/${state.items.join(',')}`
  const bulk = useBulkDelete(id, repository, scope, state.items, refresh)

  const canDelete = admin && !readOnly
  const registryPath = `/registries/${encodeURIComponent(id)}`

  async function refresh(): Promise<void> {
    await state.refresh()

    await mutate(
      (key) => {
        if (typeof key !== 'string' || !key.startsWith(`/api${registryPath}/image?`)) {
          return false
        }

        return new URLSearchParams(key.split('?')[1]).get('repository') === repository
      },
      undefined,
      { revalidate: true }
    )
  }

  let content = (
    <p className="p-12 text-center text-sm text-muted-foreground">
      {state.query ? 'No matching tags.' : 'No tags found.'}
    </p>
  )

  if (state.isLoading) {
    content = <Loading />
  } else if (state.error) {
    content = (
      <div className="p-5">
        <ErrorMessage message={state.error.message} />
      </div>
    )
  } else if (state.items.length > 0) {
    content = (
      <ul className="divide-y">
        {state.items.map((tag) => (
          <li className="flex items-center" key={tag}>
            {canDelete && (
              <input
                aria-label={`Select ${tag}`}
                checked={bulk.selected.includes(tag)}
                className="ml-5 size-4 shrink-0 accent-primary"
                disabled={bulk.busy}
                onChange={(event) =>
                  bulk.toggle(
                    tag,
                    'shiftKey' in event.nativeEvent && event.nativeEvent.shiftKey === true
                  )
                }
                type="checkbox"
              />
            )}

            <Link
              className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
              href={{
                pathname: registryPath,
                query: { repository, reference: tag },
              }}
            >
              <TagIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />

              <div className="min-w-0 flex-1">
                <code className="break-all text-sm">{tag}</code>

                <Metadata
                  id={id}
                  key={`${repository}/${tag}`}
                  reference={tag}
                  repository={repository}
                />
              </div>

              <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card shadow-xs"
      onKeyDownCapture={canDelete ? bulk.selectPage : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
        <div>
          <h2 className="font-semibold">Tags</h2>

          <p className="mt-1 text-xs text-muted-foreground">{state.data?.items.length ?? 0} tags</p>
        </div>

        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto">
          <Select
            onValueChange={(value) => {
              ordering.changeOrder(value)
              state.resetPage()
            }}
            value={ordering.order}
          >
            <SelectTrigger aria-label="Tag order" className="w-full sm:w-34">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="natural-asc">Numeric ↑</SelectItem>
              <SelectItem value="natural-desc">Numeric ↓</SelectItem>
              <SelectItem value="alpha-asc">Alphabetic ↑</SelectItem>
              <SelectItem value="alpha-desc">Alphabetic ↓</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative col-span-2 row-start-2 min-w-0 sm:flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />

            <Input
              aria-label="Filter tags"
              className="pl-9"
              onChange={state.changeQuery}
              placeholder="Filter tags"
              value={state.query}
            />
          </div>

          <Button
            aria-label="Refresh tags"
            className="col-start-2 row-start-1 shrink-0"
            disabled={state.isValidating}
            onClick={refresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={state.isValidating ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {canDelete && (state.items.length > 0 || bulk.open) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={state.items.length > 0 && bulk.selected.length === state.items.length}
              className="size-4 accent-primary"
              disabled={bulk.busy || state.items.length === 0}
              onChange={bulk.toggleAll}
              ref={(node) => {
                if (node) {
                  node.indeterminate =
                    bulk.selected.length > 0 && bulk.selected.length < state.items.length
                }
              }}
              type="checkbox"
            />
            Select all
          </label>

          <BulkDeleteDialog repository={repository} state={bulk} />
        </div>
      )}

      {canDelete && state.items.length > 0 && (
        <p className="border-b px-5 py-3 text-xs text-muted-foreground">
          Shift-click to select a range. Ctrl/Cmd+A selects this page while a tag checkbox is
          focused.
        </p>
      )}

      {content}

      <Controls
        hasNext={state.hasNext}
        hasPrevious={state.hasPrevious}
        next={state.next}
        page={state.page}
        previous={state.previous}
      />
    </section>
  )
}

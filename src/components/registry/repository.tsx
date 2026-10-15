'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Package, RefreshCw, Search } from 'lucide-react'

import { Controls } from '@/components/registry/controls'
import { Namespace } from '@/components/registry/namespace'
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
import { useRegistryPage } from '@/hooks/registry/use-page'

type Props = {
  id: string
}

export function Repository({ id }: Props) {
  const state = useRegistryPage(id)
  const [view, setView] = useState('tree')
  const registryPath = `/registries/${encodeURIComponent(id)}`

  let content = (
    <p className="p-12 text-center text-sm text-muted-foreground">
      {state.query ? 'No matching repositories.' : 'No repositories found.'}
    </p>
  )

  if (state.isLoading) {
    content = <Loading />
  } else if (state.error) {
    content = (
      <div className="p-5">
        <ErrorMessage message={state.error.message} />
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          This registry must expose the v2 catalogue API. Some hosted services restrict catalogue
          access.
        </p>
      </div>
    )
  } else if (view === 'tree' && state.matches.length > 0) {
    content = <Namespace id={id} query={state.query} repositories={state.matches} />
  } else if (state.items.length > 0) {
    content = (
      <ul className="divide-y">
        {state.items.map((name) => (
          <li key={name}>
            <Link
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
              href={{
                pathname: registryPath,
                query: { repository: name },
              }}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Package aria-hidden="true" className="size-4 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1 break-all text-sm font-medium">{name}</span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
        <div>
          <h2 className="font-semibold">Repositories</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {state.data?.items.length ?? 0} repositories · Search covers the full catalogue.
          </p>
        </div>

        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto">
          <Select onValueChange={setView} value={view}>
            <SelectTrigger aria-label="Repository view" className="w-full sm:w-28">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="tree">Tree</SelectItem>
              <SelectItem value="list">List</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative col-span-2 row-start-2 min-w-0 sm:flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Filter repositories"
              className="pl-9"
              onChange={state.changeQuery}
              placeholder="Filter repositories"
              value={state.query}
            />
          </div>

          <Button
            aria-label="Refresh repositories"
            className="col-start-2 row-start-1 shrink-0"
            disabled={state.isValidating}
            onClick={state.refresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={state.isValidating ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {content}

      {view === 'list' && (
        <Controls
          hasNext={state.hasNext}
          hasPrevious={state.hasPrevious}
          next={state.next}
          page={state.page}
          previous={state.previous}
        />
      )}
    </section>
  )
}

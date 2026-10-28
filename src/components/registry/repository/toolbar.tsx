import { RefreshCw, Search } from 'lucide-react'

import { Architecture } from '@/components/registry/shared/architecture'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type useRegistryPage } from '@/hooks/registry/use-page'

type Props = {
  onRefresh: () => Promise<void>
  onViewChange: (view: string) => void
  state: ReturnType<typeof useRegistryPage>
  view: string
}

export function Toolbar({ onRefresh, onViewChange, state, view }: Props) {
  const count = state.data?.items.length ?? 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
      <div>
        <h2 className="font-semibold">Repositories</h2>

        <p className="mt-1 text-xs text-muted-foreground">
          {count} {count === 1 ? 'repository' : 'repositories'}
        </p>
      </div>

      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto">
        <Select onValueChange={onViewChange} value={view}>
          <SelectTrigger aria-label="Repository view" className="w-full sm:w-28  h-8!">
            <SelectValue />
          </SelectTrigger>

          <SelectContent position="popper">
            <SelectItem value="tree">Tree</SelectItem>
            <SelectItem value="list">List</SelectItem>
          </SelectContent>
        </Select>

        <Architecture onChange={state.changeArchitecture} value={state.architecture} />

        <div className="relative col-span-2 row-start-2 min-w-0 sm:flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />

          <Input
            aria-label="Filter repositories"
            className="pl-9 max-w-40 h-8"
            onChange={state.changeQuery}
            placeholder="Search..."
            value={state.query}
          />
        </div>

        <Button
          aria-label="Refresh repositories"
          className="col-start-2 row-start-1 shrink-0"
          disabled={state.isValidating}
          onClick={onRefresh}
          size="icon"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className={state.isValidating ? 'animate-spin' : ''} />
        </Button>
      </div>
    </div>
  )
}

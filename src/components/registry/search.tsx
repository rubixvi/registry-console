'use client'

import { SearchIcon } from 'lucide-react'

import { Architecture } from '@/components/registry/shared/architecture'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Registry } from '@/types/registry'

type Props = {
  registries: Registry[]
  query: string
  registry: string
  architecture: string
  onQueryChange: (value: string) => void
  onRegistryChange: (value: string) => void
  onArchitectureChange: (value: string) => void
}

export function Search({
  registries,
  query,
  registry,
  architecture,
  onQueryChange,
  onRegistryChange,
  onArchitectureChange,
}: Props) {
  return (
    <section aria-label="Registry filters" className="mb-5 rounded-xl border bg-card p-3 sm:p-4">
      <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative col-span-2 min-w-0 sm:col-span-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />

          <Input
            aria-label="Search..."
            className="pl-9 h-8"
            maxLength={128}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search..."
            value={query}
          />
        </div>

        <Select onValueChange={onRegistryChange} value={registry}>
          <SelectTrigger aria-label="Registry filter" className="w-full sm:w-40 h-8">
            <SelectValue />
          </SelectTrigger>

          <SelectContent position="popper">
            <SelectItem value="all">Network</SelectItem>

            {registries.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Architecture onChange={onArchitectureChange} value={architecture} />
      </div>
    </section>
  )
}

'use client'

import { Search } from 'lucide-react'

import { Architecture } from '@/components/registry/filters/architecture'
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

export function RegistrySearch({
  registries,
  query,
  registry,
  architecture,
  onQueryChange,
  onRegistryChange,
  onArchitectureChange,
}: Props) {
  return (
    <section aria-label="Registry filters" className="mb-7 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />

          <Input
            aria-label="Search..."
            className="pl-9"
            maxLength={128}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search..."
            value={query}
          />
        </div>

        <Select onValueChange={onRegistryChange} value={registry}>
          <SelectTrigger aria-label="Registry filter" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">All registries</SelectItem>

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

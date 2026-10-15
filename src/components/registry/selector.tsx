'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Network } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Registry } from '@/types/registry'

type Props = {
  registries: Pick<Registry, 'id' | 'name'>[]
}

export function RegistrySelector({ registries }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const id = pathname.startsWith('/registries/') ? pathname.split('/')[2] : ''
  const current = registries.some((registry) => registry.id === id) ? id : 'all'

  function select(value: string): void {
    router.push(value === 'all' ? '/' : `/registries/${encodeURIComponent(value)}`)
  }

  return (
    <Select disabled={registries.length === 0} onValueChange={select} value={current}>
      <SelectTrigger aria-label="Registry" className="border-white/15 bg-white/5 text-white w-full">
        <span className="flex min-w-0 items-center gap-2">
          <Network aria-hidden="true" className="size-4 shrink-0" />
          <SelectValue className="truncate" placeholder="Select registry" />
        </span>
      </SelectTrigger>

      <SelectContent>
        <SelectItem value="all">All registries</SelectItem>

        {registries.map((registry) => (
          <SelectItem key={registry.id} value={registry.id}>
            {registry.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

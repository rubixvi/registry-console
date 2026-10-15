'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutGrid, ScrollText, Settings2, ShieldCheck } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Props = {
  admin: boolean
}

export function Navigation({ admin }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const items = [
    { href: '/', label: 'Registries', icon: LayoutGrid },
    { href: '/account', label: 'Security', icon: ShieldCheck },
    ...(admin
      ? [
          { href: '/audit', label: 'Audit', icon: ScrollText },
          { href: '/settings', label: 'Settings', icon: Settings2 },
        ]
      : []),
  ]
  const current =
    items.find((item) => item.href !== '/' && pathname.startsWith(item.href))?.href ?? '/'

  return (
    <>
      <div className="lg:hidden">
        <Select onValueChange={(value) => router.push(value)} value={current}>
          <SelectTrigger
            aria-label="Navigation"
            className="border-white/15 bg-white/5 text-white w-full"
          >
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                <span className="flex items-center gap-2">
                  <item.icon aria-hidden="true" />
                  {item.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav aria-label="Main navigation" className="hidden gap-2 lg:flex lg:flex-col">
        {items.map((item) => (
          <Link
            aria-current={current === item.href ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10',
              current === item.href && 'bg-white/10 text-white'
            )}
            href={item.href}
            key={item.href}
          >
            <item.icon aria-hidden="true" className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  )
}

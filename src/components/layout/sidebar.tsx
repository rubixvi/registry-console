import Link from 'next/link'

import { LogoutButton } from '@/components/auth/logout-button'
import { Brand } from '@/components/layout/brand'
import { Navigation } from '@/components/layout/navigation'
import { RegistrySelector } from '@/components/registry/selector'
import { buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'
import { type Identity } from '@/types/auth'
import { type Branding } from '@/types/branding'
import { type Registry } from '@/types/registry'

type Props = {
  branding: Branding
  identity: Identity
  registries: Pick<Registry, 'id' | 'name'>[]
}

export function Sidebar({ branding, identity, registries }: Props) {
  const isAdmin = identity.role === 'admin'

  return (
    <aside className="flex shrink-0 flex-col bg-(--brand-background) px-5 py-4 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:py-6">
      <div className="flex items-center justify-between gap-3">
        <Link aria-label="Registry home" className="min-w-0" href="/">
          <Brand branding={branding} />
        </Link>

        <div className="shrink-0 lg:hidden">
          <LogoutButton />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:mt-6 lg:grid-cols-1 lg:gap-6">
        <div className="min-w-0 lg:order-2">
          <Navigation admin={isAdmin} />
        </div>

        <div className="min-w-0 lg:order-1">
          <RegistrySelector registries={registries} />
        </div>
      </div>

      <div className="mt-auto pt-5 gap-2 hidden lg:flex lg:flex-row">
        <ThemeToggle
          className={cn(
            buttonVariants({ variant: 'link', size: 'icon-sm' }),
            'text-white cursor-pointer transition-all duration-500'
          )}
        />
        <LogoutButton />
      </div>
    </aside>
  )
}

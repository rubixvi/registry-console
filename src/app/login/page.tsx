import { redirect } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'

import { LoginForm } from '@/components/auth/login-form'
import { Brand } from '@/components/layout/brand'
import { getIdentity } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'

export default async function LoginPage() {
  const identity = await getIdentity()

  if (identity) redirect('/')

  const branding = getSettings()

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-(--brand-background) p-8 text-white lg:flex">
        <div className="relative z-10">
          <Brand branding={branding} />
        </div>

        {branding.footer && (
          <p className="relative z-10 mt-auto pt-8 text-xs text-white">{branding.footer}</p>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-48 bottom-12 size-145 rounded-full border border-white/5 shadow-[0_0_0_70px_#ffffff03,0_0_0_140px_#ffffff02]"
        />
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-4">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
              <LockKeyhole aria-hidden="true" className="size-5 text-primary" />
            </span>

            <div className="flex flex-col gap-0.5">
              <h1 className="text-xl font-semibold tracking-tight">Welcome</h1>
              <p className="text-sm text-muted-foreground">Sign in to access your registries.</p>
            </div>
          </div>

          <LoginForm />
        </div>
      </section>
    </main>
  )
}

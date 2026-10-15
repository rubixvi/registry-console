import { Network } from 'lucide-react'

import { PageHeading } from '@/components/layout/page-heading'
import { RegistryCard } from '@/components/registry/registry-card'
import { RegistryForm } from '@/components/registry/registry-form'
import { type Identity } from '@/types/auth'
import { type Registry } from '@/types/registry'

type Props = {
  registries: Registry[]
  identity: Identity
}

export function RegistryList({ registries, identity }: Props) {
  const isAdmin = identity.role === 'admin'
  const count = registries.length
  const connectionLabel = count === 1 ? 'connection' : 'connections'

  return (
    <>
      <PageHeading description="Browse and manage your connected registries." title="Registries" />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {count} configured {connectionLabel}
        </p>

        {isAdmin && <RegistryForm />}
      </div>

      {count > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {registries.map((registry) => (
            <RegistryCard key={registry.id} registry={registry} />
          ))}
        </div>
      ) : (
        <section className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 text-center">
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-muted">
            <Network aria-hidden="true" className="size-7 text-muted-foreground" />
          </span>

          <h2 className="text-lg font-semibold">No registries connected</h2>

          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            {isAdmin
              ? 'Add a compatible registry to browse its repositories and image tags.'
              : 'Ask an administrator to add a registry connection.'}
          </p>
        </section>
      )}
    </>
  )
}

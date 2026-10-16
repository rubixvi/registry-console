'use client'

import { type ReactNode, useState } from 'react'
import { Network } from 'lucide-react'

import { Heading } from '@/components/layout/heading'
import { RegistrySearch } from '@/components/registry/filters/search'
import { RegistryCard } from '@/components/registry/registry-card'
import { RegistryForm } from '@/components/registry/registry-form'
import { ErrorMessage } from '@/components/shared/error-message'
import { Loading } from '@/components/shared/loading'
import { useResource } from '@/hooks/shared/use-resource'
import { type Identity } from '@/types/auth'
import { type Registry } from '@/types/registry'

type Props = {
  registries: Registry[]
  identity: Identity
}

type Matches = {
  results: { registryId: string }[]
  failures: { registryName: string; message: string }[]
}

export function RegistryList({ registries, identity }: Props) {
  const [query, setQuery] = useState('')
  const [registry, setRegistry] = useState('all')
  const [architecture, setArchitecture] = useState('all')

  const parameters = new URLSearchParams({ architecture })

  if (registry !== 'all') {
    parameters.set('registry', registry)
  }

  const platform = architecture !== 'all'
  const state = useResource<Matches>(platform ? `/api/search?${parameters}` : null)

  const admin = identity.role === 'admin'
  const count = registries.length
  const text = query.trim().toLowerCase()
  const matches = new Set(state.data?.results.map((item) => item.registryId))

  const loading = platform && state.isLoading
  const error = platform ? state.error : undefined
  const failures = platform ? (state.data?.failures ?? []) : []

  const items = registries.filter((item) => {
    const selected = registry === 'all' || item.id === registry
    const supported = !platform || matches.has(item.id)
    const found = [item.name, item.url, item.namespace ?? ''].some((value) =>
      value.toLowerCase().includes(text)
    )

    return selected && supported && found
  })

  const filtered = text.length > 0 || registry !== 'all' || platform
  const label = count === 1 ? 'connection' : 'connections'
  const message = failures.map((item) => `${item.registryName} · ${item.message}`).join('\n')

  let content: ReactNode

  if (loading) {
    content = <Loading />
  } else if (count === 0) {
    content = (
      <section className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 text-center">
        <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Network aria-hidden="true" className="size-7 text-muted-foreground" />
        </span>

        <h2 className="text-lg font-semibold">No registries connected</h2>

        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          {admin
            ? 'Add a registry to browse its repositories.'
            : 'Ask an administrator to add a registry connection.'}
        </p>
      </section>
    )
  } else if (items.length > 0) {
    content = (
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <RegistryCard key={item.id} registry={item} />
        ))}
      </div>
    )
  } else {
    content = (
      <p className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
        {error || failures.length > 0
          ? 'Unable to check every registry. Adjust the filters or try again.'
          : 'No matching registries.'}
      </p>
    )
  }

  return (
    <>
      <Heading description="Browse and manage your connected registries." title="Registries" />

      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {loading
            ? 'platform registries…'
            : filtered
              ? `${items.length} of ${count} ${label}`
              : `${count} configured ${label}`}
        </p>

        {admin && <RegistryForm />}
      </div>

      {count > 0 && (
        <RegistrySearch
          architecture={architecture}
          onArchitectureChange={setArchitecture}
          onQueryChange={setQuery}
          onRegistryChange={setRegistry}
          query={query}
          registries={registries}
          registry={registry}
        />
      )}

      <ErrorMessage message={error?.message || message} />

      {content}
    </>
  )
}

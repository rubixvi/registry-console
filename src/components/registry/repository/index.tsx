'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'

import { Content } from '@/components/registry/repository/content'
import { Toolbar } from '@/components/registry/repository/toolbar'
import { Pagination } from '@/components/registry/shared/pagination'
import { useRegistryPage } from '@/hooks/registry/use-page'

type Props = {
  id: string
}

export function Repository({ id }: Props) {
  const { mutate } = useSWRConfig()
  const state = useRegistryPage(id)
  const [view, setView] = useState('tree')

  async function refresh(): Promise<void> {
    await state.refresh()

    const prefix = `/api/registries/${encodeURIComponent(id)}/`

    await mutate(
      (key) =>
        typeof key === 'string' &&
        (key.startsWith(`${prefix}tags?`) || key.startsWith(`${prefix}image?`))
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Toolbar onRefresh={refresh} onViewChange={setView} state={state} view={view} />

      <Content id={id} state={state} tree={view === 'tree'} />

      {view !== 'tree' && (
        <Pagination
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

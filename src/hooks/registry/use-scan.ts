'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import useSWR from 'swr'

import { apiRequest } from '@/lib/http/client'
import { type ScanStatus } from '@/types/scan'

export function useScan(id: string, repository: string, digest: string) {
  const [busy, setBusy] = useState(false)
  const params = new URLSearchParams({ repository, digest })
  const endpoint = `/api/registries/${encodeURIComponent(id)}/scan`

  const resource = useSWR<ScanStatus>(`${endpoint}?${params}`, apiRequest<ScanStatus>, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 10_000,
    refreshInterval: (current) =>
      current?.status === 'running'
        ? 3000
        : current?.enabled && current.status !== 'complete'
          ? 30_000
          : 0,
  })

  async function scan(override = false): Promise<void> {
    if (busy || resource.data?.status === 'running' || resource.data?.status === 'complete') return

    setBusy(true)

    try {
      const result = await apiRequest<ScanStatus>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ repository, digest, override }),
      })

      await resource.mutate(result, { revalidate: false })
      toast.success(
        result.status === 'complete'
          ? 'Stored vulnerability report loaded.'
          : 'Vulnerability scan started.'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to start the scan.')
      await resource.mutate().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return { ...resource, busy, scan }
}

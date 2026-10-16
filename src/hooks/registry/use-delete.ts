'use client'

import { type ChangeEvent, type MouseEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { apiRequest } from '@/lib/http/client'

export function useDelete(id: string, repository: string, digest: string) {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const registryId = encodeURIComponent(id)

  function changeConfirmation(event: ChangeEvent<HTMLInputElement>): void {
    setConfirmation(event.target.value)
  }

  async function remove(event: MouseEvent): Promise<void> {
    event.preventDefault()

    if (busy) return

    setBusy(true)
    setError('')

    try {
      await apiRequest(`/api/registries/${registryId}/image`, {
        method: 'DELETE',
        body: JSON.stringify({ repository, digest, confirmation }),
      })

      const query = new URLSearchParams({ repository })

      toast.success('Manifest deleted.')
      router.push(`/registries/${registryId}?${query}`)
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deletion failed.'

      setError(message)
      setBusy(false)
    }
  }

  return { confirmation, changeConfirmation, error, busy, remove }
}

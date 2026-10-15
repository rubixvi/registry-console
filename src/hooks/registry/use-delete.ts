'use client'

import { type ChangeEvent, type MouseEvent, useState } from 'react'

import { apiRequest } from '@/lib/http/client'
import { reloadPage } from '@/utils/reload'

export function useDelete(id: string, repository: string, digest: string) {
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

      reloadPage(`/registries/${registryId}?${query}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deletion failed.'

      setError(message)
      setBusy(false)
    }
  }

  return { confirmation, changeConfirmation, error, busy, remove }
}

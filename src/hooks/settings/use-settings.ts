'use client'

import { type SubmitEvent, useState } from 'react'

import { apiRequest } from '@/lib/http/client'
import { reloadPage } from '@/utils/reload'

export function useSettings() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (busy) return

    const form = new FormData(event.currentTarget)

    setBusy(true)
    setError('')

    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: form,
      })

      reloadPage('/settings?saved=1')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save settings.'

      setError(message)
      setBusy(false)
    }
  }

  async function remove(): Promise<void> {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await apiRequest('/api/settings', {
        method: 'DELETE',
      })

      reloadPage('/settings?saved=1')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove logo.'

      setError(message)
      setBusy(false)
    }
  }

  return { busy, error, submit, remove }
}

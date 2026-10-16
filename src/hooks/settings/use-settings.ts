'use client'

import { type SubmitEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { apiRequest } from '@/lib/http/client'

export function useSettings() {
  const router = useRouter()
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

      toast.success('Settings saved.')
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save settings.'

      setError(message)
    } finally {
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

      toast.success('Settings saved.')
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove logo.'

      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, submit, remove }
}

'use client'

import { type MouseEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { apiRequest } from '@/lib/http/client'

export function useConnection(id: string) {
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const endpoint = `/api/registries/${encodeURIComponent(id)}`

  async function test(): Promise<void> {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await apiRequest(`${endpoint}/status`)
      toast.success('Connected successfully.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed.'

      setError(message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(event: MouseEvent): Promise<void> {
    event.preventDefault()

    if (busy) return

    setBusy(true)
    setError('')

    try {
      await apiRequest(endpoint, {
        method: 'DELETE',
        body: '{}',
      })

      toast.success('Connection removed.')
      router.push('/')
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Removal failed.'

      setError(message)
      setBusy(false)
    }
  }

  return { busy, error, test, remove }
}

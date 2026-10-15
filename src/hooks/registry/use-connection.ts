'use client'

import { type MouseEvent, useState } from 'react'

import { apiRequest } from '@/lib/http/client'
import { reloadPage } from '@/utils/reload'

export function useConnection(id: string) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const endpoint = `/api/registries/${encodeURIComponent(id)}`

  async function test(): Promise<void> {
    if (busy) return

    setBusy(true)
    setError('')
    setStatus('')

    try {
      await apiRequest(`${endpoint}/status`)
      setStatus('Connected successfully.')
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
    setStatus('')

    try {
      await apiRequest(endpoint, {
        method: 'DELETE',
        body: '{}',
      })

      reloadPage('/')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Removal failed.'

      setError(message)
      setBusy(false)
    }
  }

  return { busy, error, status, test, remove }
}

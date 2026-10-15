'use client'

import { type SyntheticEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

import { apiRequest } from '@/lib/http/client'

export function useRegistryForm(id?: string) {
  const router = useRouter()

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  function toggle(): void {
    if (busy) return

    setOpen((current) => !current)
    setError('')
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (busy) return

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const input = {
      name: form.get('name'),
      url: form.get('url'),
      pullUrl: form.get('pullUrl') ?? '',
      username: form.get('username'),
      password: form.get('password'),
      readOnly: form.get('readOnly') === 'on',
    }

    const endpoint = id ? `/api/registries/${encodeURIComponent(id)}` : '/api/registries'

    const method = id ? 'PUT' : 'POST'

    setBusy(true)
    setError('')

    try {
      await apiRequest(endpoint, {
        method,
        body: JSON.stringify(input),
      })

      setOpen(false)
      formElement.reset()
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save connection.'

      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return { error, busy, open, toggle, submit }
}

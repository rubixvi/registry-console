'use client'

import { useState } from 'react'

import { apiRequest } from '@/lib/http/client'
import { reloadPage } from '@/utils/reload'

export function useLogout() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function logout(): Promise<void> {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: '{}',
      })

      reloadPage('/login')
    } catch {
      setError('Sign out failed. Try again.')
      setBusy(false)
    }
  }

  return { error, busy, logout }
}

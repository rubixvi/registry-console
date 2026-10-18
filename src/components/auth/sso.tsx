'use client'

import { useState } from 'react'

import { ErrorMessage } from '@/components/shared/error-message'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/http/client'
import { type SsoButton } from '@/types/sso'

type Props = { providers: SsoButton[]; action?: 'login' | 'verify'; disabled?: boolean }

export function SsoButtons({ providers, action = 'login', disabled }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signIn(id: string): Promise<void> {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      const result = await apiRequest<{ url: string }>(`/api/auth/sso/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })

      window.location.assign(result.url)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'SSO sign-in failed.')
      setBusy(false)
    }
  }

  if (!providers.length) return null

  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <Button
          className="w-full"
          disabled={disabled || busy}
          key={provider.id}
          onClick={() => void signIn(provider.id)}
          type="button"
          variant="outline"
        >
          {action === 'verify' ? 'Verify' : 'Sign in'} with {provider.name}
        </Button>
      ))}

      <ErrorMessage message={error} />
    </div>
  )
}

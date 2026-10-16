'use client'

import { type SyntheticEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { startRegistration } from '@simplewebauthn/browser'
import { type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server'
import { toast } from 'sonner'

import { apiRequest } from '@/lib/http/client'
import { type TotpSetup } from '@/types/security'
import { reloadPage } from '@/utils/reload'

export function useSecurity() {
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [codes, setCodes] = useState<string[]>([])

  async function run(operation: () => Promise<void>): Promise<void> {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await operation()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update security settings.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const form = event.currentTarget
    const data = new FormData(form)

    await run(async () => {
      await apiRequest('/api/account/security/verify', {
        method: 'POST',
        body: JSON.stringify({
          password: data.get('password'),
          code: data.get('code') || undefined,
        }),
      })

      form.reset()
      setVerified(true)
      toast.success('Identity verified.')
    })
  }

  async function addPasskey(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const form = event.currentTarget
    const name = new FormData(form).get('name')

    await run(async () => {
      const optionsJSON = await apiRequest<PublicKeyCredentialCreationOptionsJSON>(
        '/api/account/passkeys/options',
        {
          method: 'POST',
        }
      )
      const credential = await startRegistration({ optionsJSON })

      await apiRequest('/api/account/passkeys/verify', {
        method: 'POST',
        body: JSON.stringify({ name, credential }),
      })

      form.reset()
      toast.success('Passkey added.')
      router.refresh()
    })
  }

  async function removePasskey(id: string): Promise<void> {
    await run(async () => {
      await apiRequest('/api/account/passkeys', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      })
      toast.success('Passkey removed.')
      router.refresh()
    })
  }

  async function beginTotp(): Promise<void> {
    await run(async () => {
      setSetup(
        await apiRequest<TotpSetup>('/api/account/totp/setup', {
          method: 'POST',
        })
      )
    })
  }

  async function enableTotp(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const code = new FormData(event.currentTarget).get('code')

    await run(async () => {
      const result = await apiRequest<{ recoveryCodes: string[] }>('/api/account/totp', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })

      toast.success('Authenticator enabled. Save your recovery codes.')
      setCodes(result.recoveryCodes)
      setSetup(null)
      setVerified(false)
      router.refresh()
    })
  }

  async function disableTotp(): Promise<void> {
    await run(async () => {
      await apiRequest('/api/account/totp', { method: 'DELETE' })
      reloadPage('/login')
    })
  }

  return {
    busy,
    error,
    verified,
    setVerified,
    setup,
    setSetup,
    codes,
    setCodes,
    verify,
    addPasskey,
    removePasskey,
    beginTotp,
    enableTotp,
    disableTotp,
  }
}

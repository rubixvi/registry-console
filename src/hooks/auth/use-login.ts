'use client'

import { type SyntheticEvent, useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server'

import { apiRequest } from '@/lib/http/client'
import { type LoginResult } from '@/types/security'
import { reloadPage } from '@/utils/reload'

export function useLogin() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)
  const [recovery, setRecovery] = useState(false)

  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (busy) return

    const form = new FormData(event.currentTarget)

    setBusy(true)
    setError('')

    try {
      const result = await apiRequest<LoginResult>(
        twoFactor ? '/api/auth/login/verify' : '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(
            twoFactor
              ? { code: form.get('code') }
              : {
                  username: form.get('username'),
                  password: form.get('password'),
                }
          ),
        }
      )

      if (result.requiresTwoFactor) {
        setTwoFactor(true)
      } else {
        reloadPage('/')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  async function passkey(): Promise<void> {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      const optionsJSON = await apiRequest<PublicKeyCredentialRequestOptionsJSON>(
        '/api/auth/passkey/options',
        {
          method: 'POST',
        }
      )
      const credential = await startAuthentication({ optionsJSON })

      await apiRequest('/api/auth/passkey/verify', {
        method: 'POST',
        body: JSON.stringify(credential),
      })

      reloadPage('/')
    } catch (error) {
      const cancelled =
        error instanceof Error && ['NotAllowedError', 'AbortError'].includes(error.name)

      setError(
        cancelled
          ? 'Passkey sign-in was cancelled or timed out.'
          : error instanceof Error
            ? error.message
            : 'Passkey sign-in failed.'
      )
    } finally {
      setBusy(false)
    }
  }

  function restart(): void {
    setTwoFactor(false)
    setRecovery(false)
    setError('')
  }

  return {
    error,
    busy,
    twoFactor,
    recovery,
    setRecovery,
    submit,
    passkey,
    restart,
  }
}

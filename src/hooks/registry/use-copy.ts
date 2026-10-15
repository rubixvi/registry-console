'use client'

import { useState } from 'react'

export function useCopy(value: string) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function copy(): Promise<void> {
    setCopied(false)
    setError('')

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setError('Select and copy the command manually.')
    }
  }

  return { copied, error, copy }
}

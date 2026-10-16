'use client'

import { useState } from 'react'
import { toast } from 'sonner'

export function useCopy(value: string) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function copy(): Promise<void> {
    setCopied(false)
    setError('')

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Command copied.')
    } catch {
      setError('Select and copy the command manually.')
      toast.error('Select and copy the command manually.')
    }
  }

  return { copied, error, copy }
}

'use client'

import { useEffect, useId } from 'react'
import { toast } from 'sonner'

type Props = {
  message?: string
}

export function ErrorMessage({ message }: Props) {
  const id = useId()

  useEffect(() => {
    if (message) {
      toast.error(message, { id })
    } else {
      toast.dismiss(id)
    }

    return () => {
      toast.dismiss(id)
    }
  }, [id, message])

  return null
}
